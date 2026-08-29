package com.cortex.cortex_backend.adapter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * VaultX Codebase Adapter.
 * Parses a Java/Spring Boot codebase (pom.xml + .java files) and extracts entities,
 * relationships, and git events into the Cortex reasoning vocabulary.
 *
 * Exact functional port of the Python VaultXAdapter.
 */
public class VaultXAdapter implements DomainAdapter {

    private static final Logger log = LoggerFactory.getLogger(VaultXAdapter.class);

    private final String rootPath;

    private List<Map<String, Object>> parsedEntities;
    private List<Map<String, Object>> parsedRelationships;
    private List<Map<String, Object>> parsedEvents;
    private boolean isParsed = false;

    public VaultXAdapter(String rootPath) {
        this.rootPath = rootPath;
    }

    private void parseCodebase() {
        if (isParsed) return;

        Map<String, Map<String, Object>> entitiesMap = new LinkedHashMap<>();
        List<Map<String, Object>> relationships = new ArrayList<>();
        List<Map<String, Object>> events = new ArrayList<>();

        String appEntityId = "com.vaultx.VaultXApplication";
        entitiesMap.put(appEntityId, entity("Application", appEntityId, "VaultXApplication",
                Map.of("framework", "Spring Boot")));

        // ─── 1. Parse pom.xml Maven dependencies ──────────────────────────────
        File root = new File(rootPath);
        if (!root.exists()) {
            for (String fallback : List.of("../adapter/VaultX", "adapter/VaultX", "../../adapter/VaultX")) {
                File f = new File(fallback);
                if (f.exists()) {
                    root = f;
                    break;
                }
            }
        }
        List<File> pomFiles = new ArrayList<>();
        findFiles(root, "pom.xml", pomFiles);

        for (File pomFile : pomFiles) {
            try {
                Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(pomFile);
                doc.getDocumentElement().normalize();
                NodeList deps = doc.getElementsByTagName("dependency");
                for (int i = 0; i < deps.getLength(); i++) {
                    Element dep = (Element) deps.item(i);
                    String groupId = textOf(dep, "groupId", "org");
                    String artifactId = textOf(dep, "artifactId", null);
                    if (artifactId == null) continue;

                    String libId = "maven:" + groupId + ":" + artifactId;
                    entitiesMap.put(libId, entity("Library", libId, artifactId,
                            Map.of("group_id", groupId, "artifact_id", artifactId)));

                    relationships.add(rel("Application", appEntityId, "Library", libId,
                            "DEPENDS_ON", 1.0, "pom.xml:" + pomFile.getName(),
                            Map.of("dependency_source", "pom.xml")));
                }
            } catch (Exception e) {
                log.warn("Error parsing pom.xml {}: {}", pomFile.getPath(), e.getMessage());
            }
        }

        // ─── 2. Parse Java source files ───────────────────────────────────────
        List<File> javaFiles = new ArrayList<>();
        findFiles(root, ".java", javaFiles);

        Map<String, String> classToFile = new HashMap<>();
        Map<String, String> classToType = new HashMap<>();

        for (File jFile : javaFiles) {
            try {
                String content = Files.readString(jFile.toPath());

                // Extract package
                Matcher pkgMatcher = Pattern.compile("package\\s+([a-zA-Z0-9_.]+);").matcher(content);
                String pkg = pkgMatcher.find() ? pkgMatcher.group(1) : "com.vaultx.VaultX";

                // Extract class name
                Matcher classMatcher = Pattern.compile(
                        "public\\s+(?:class|interface|enum)\\s+([a-zA-Z0-9_]+)").matcher(content);
                if (!classMatcher.find()) continue;

                String className = classMatcher.group(1);
                String fullClassId = pkg + "." + className;

                // Detect annotation entity type
                String entityType = "Class";
                if (content.contains("@RestController") || content.contains("@Controller")) entityType = "Controller";
                else if (content.contains("@Service")) entityType = "Service";
                else if (content.contains("@Repository")) entityType = "Repository";
                else if (content.contains("@Entity")) entityType = "Entity";
                else if (content.contains("interface ")) entityType = "Interface";

                classToFile.put(className, jFile.getPath());
                classToType.put(className, entityType);
                classToType.put(fullClassId, entityType);

                entitiesMap.put(fullClassId, entity(entityType, fullClassId, className,
                        Map.of("package", pkg, "file_path", jFile.getPath())));

                // Application OWNS core components
                relationships.add(rel("Application", appEntityId, entityType, fullClassId,
                        "OWNS", 1.0, className + ".java:L1",
                        Map.of("container", "VaultXApplication")));

                // Controller → IMPLEMENTS API endpoints
                if ("Controller".equals(entityType)) {
                    Matcher endpointMatcher = Pattern.compile(
                            "@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)" +
                            "\\s*\\(\\s*(?:value\\s*=\\s*)?[\"']([^\"']+)[\"']").matcher(content);
                    while (endpointMatcher.find()) {
                        String httpMethod = endpointMatcher.group(1);
                        String endpoint = endpointMatcher.group(2);
                        String apiId = "API:" + httpMethod.toUpperCase() + ":" + endpoint;
                        entitiesMap.put(apiId, entity("API", apiId,
                                httpMethod.toUpperCase() + " " + endpoint,
                                Map.of("endpoint", endpoint, "http_method", httpMethod.toUpperCase())));
                        relationships.add(rel("Controller", fullClassId, "API", apiId,
                                "IMPLEMENTS", 1.0, className + ".java",
                                Map.of("endpoint", endpoint)));
                    }
                }

                // Intra-project imports → DEPENDS_ON
                String[] lines = content.split("\\r?\\n");
                for (int lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                    String line = lines[lineIdx].trim();
                    if (line.startsWith("import com.vaultx.")) {
                        String imported = line.replace("import ", "").replace(";", "").trim();
                        String impClass = imported.substring(imported.lastIndexOf('.') + 1);
                        if (classToFile.containsKey(impClass) && !impClass.equals(className)) {
                            String impType = classToType.getOrDefault(impClass, "Class");
                            relationships.add(rel(entityType, fullClassId, impType, imported,
                                    "DEPENDS_ON", 0.9, className + ".java:L" + (lineIdx + 1),
                                    Map.of("dependency_type", "import")));
                        }
                    }

                    // @Autowired / private final field injection
                    Matcher fieldMatcher = Pattern.compile(
                            "private\\s+(?:final\\s+)?([A-Z][a-zA-Z0-9_]+)\\s+[a-zA-Z0-9_]+;").matcher(line);
                    if (fieldMatcher.find()) {
                        String targetClassName = fieldMatcher.group(1);
                        if (classToFile.containsKey(targetClassName) && !targetClassName.equals(className)) {
                            try {
                                String targetContent = Files.readString(Path.of(classToFile.get(targetClassName)));
                                Matcher tPkgMatcher = Pattern.compile("package\\s+([a-zA-Z0-9_.]+);").matcher(targetContent);
                                String targetPkg = tPkgMatcher.find() ? tPkgMatcher.group(1) : pkg;
                                String targetFullId = targetPkg + "." + targetClassName;
                                String targetType = classToType.getOrDefault(targetClassName, "Service");
                                relationships.add(rel(entityType, fullClassId, targetType, targetFullId,
                                        "DEPENDS_ON", 1.0, className + ".java:L" + (lineIdx + 1),
                                        Map.of("dependency_type", "@Autowired_field")));
                            } catch (Exception ignored) {}
                        }
                    }
                }

            } catch (Exception e) {
                log.warn("Error reading Java file {}: {}", jFile.getPath(), e.getMessage());
            }
        }

        // ─── 3. Simulated Git history event ───────────────────────────────────
        events.add(Map.of(
                "type", "GitCommit",
                "entity_id", appEntityId,
                "timestamp", "2026-07-31T00:00:00Z",
                "source", "git:simulated",
                "details", Map.of(
                        "hash", "c0rtex01",
                        "author", "VaultX Dev Team",
                        "message", "VaultX feature integration commit"
                )
        ));

        this.parsedEntities = new ArrayList<>(entitiesMap.values());
        this.parsedRelationships = relationships;
        this.parsedEvents = events;
        this.isParsed = true;

        log.info("VaultXAdapter: Parsed {} entities, {} relationships, {} events from '{}'",
                parsedEntities.size(), parsedRelationships.size(), parsedEvents.size(), rootPath);
    }

    @Override
    public List<Map<String, Object>> extractEntities() {
        parseCodebase();
        return parsedEntities;
    }

    @Override
    public List<Map<String, Object>> extractRelationships() {
        parseCodebase();
        return parsedRelationships;
    }

    @Override
    public List<Map<String, Object>> extractEvents() {
        parseCodebase();
        return parsedEvents;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private void findFiles(File dir, String suffix, List<File> result) {
        if (dir == null || !dir.exists()) return;
        File[] children = dir.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (child.isDirectory()) {
                findFiles(child, suffix, result);
            } else if (child.getName().endsWith(suffix)) {
                result.add(child);
            }
        }
    }

    private Map<String, Object> entity(String type, String id, String name, Map<String, Object> props) {
        Map<String, Object> m = new HashMap<>();
        m.put("type", type);
        m.put("id", id);
        m.put("name", name);
        m.put("properties", new HashMap<>(props));
        return m;
    }

    private Map<String, Object> rel(String srcType, String srcId, String tgtType, String tgtId,
                                     String type, double confidence, String evidenceRef,
                                     Map<String, Object> metadata) {
        Map<String, Object> m = new HashMap<>();
        m.put("source_type", srcType);
        m.put("source_id", srcId);
        m.put("target_type", tgtType);
        m.put("target_id", tgtId);
        m.put("type", type);
        m.put("confidence", confidence);
        m.put("evidence_ref", evidenceRef);
        m.put("metadata", metadata != null ? new HashMap<>(metadata) : new HashMap<>());
        return m;
    }

    private String textOf(Element parent, String tagName, String defaultVal) {
        NodeList nl = parent.getElementsByTagName(tagName);
        if (nl.getLength() > 0 && nl.item(0).getTextContent() != null) {
            return nl.item(0).getTextContent().trim();
        }
        return defaultVal;
    }
}
