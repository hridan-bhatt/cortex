package com.cortex.backend.service;

import com.cortex.backend.dto.GraphDtos;
import com.cortex.backend.entity.EdgeEntity;
import com.cortex.backend.entity.NodeEntity;
import com.cortex.backend.repository.EdgeRepository;
import com.cortex.backend.repository.NodeRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;


@Service
public class GraphTraversalService {

    /**
     * Canonical structural dependency relationships analyzed by Cortex.
     */
    public static final Set<String> DEPENDENCY_RELATIONSHIPS = com.cortex.backend.model.RelationshipTypes.DEPENDENCY_RELATIONSHIPS;

    private final NodeRepository nodeRepo;
    private final EdgeRepository edgeRepo;

    public GraphTraversalService(NodeRepository nodeRepo, EdgeRepository edgeRepo) {
        this.nodeRepo = nodeRepo;
        this.edgeRepo = edgeRepo;
    }

    @Transactional(readOnly = true)
    public GraphDtos.DependencyResponse getDependencyChain(String startEntityId) {
        List<NodeEntity> allNodes = nodeRepo.findAll();
        Map<String, NodeEntity> nodeByEntityId = new HashMap<>();
        Map<String, NodeEntity> nodeById = new HashMap<>();
        for (NodeEntity n : allNodes) {
            nodeByEntityId.put(n.getEntityId(), n);
            nodeById.put(n.getId(), n);
        }

        NodeEntity startNode = nodeByEntityId.get(startEntityId);
        if (startNode == null) {
            GraphDtos.DependencyResponse resp = new GraphDtos.DependencyResponse();
            resp.setId(startEntityId);
            resp.setEntityId(startEntityId);
            resp.setDependencyChain(List.of());
            resp.setImpactedCount(0);
            return resp;
        }

        List<EdgeEntity> edges = edgeRepo.findAll();


        // This finds who DEPENDS_ON the start node......meaning who gets impacted
        Map<String, List<Object[]>> reverseAdj = new HashMap<>();
        for (EdgeEntity e : edges) {
            if ("DEPENDS_ON".equals(e.getRelationshipType()) || "IMPLEMENTS".equals(e.getRelationshipType())) {
                reverseAdj.computeIfAbsent(e.getTargetId(), k -> new ArrayList<>())
                          .add(new Object[]{e.getSourceId(), e.getRelationshipType()});
            }
        }

        // BFS from startNode
        Set<String> visited = new HashSet<>();
        Queue<Object[]> queue = new LinkedList<>();
        queue.add(new Object[]{startNode.getId(), 0, "ROOT"});
        List<GraphDtos.DependencyChainItem> dependencyChain = new ArrayList<>();

        while (!queue.isEmpty()) {
            Object[] curr = queue.poll();
            String currNodeId = (String) curr[0];
            int depth = (int) curr[1];
            String relType = (String) curr[2];

            if (visited.contains(currNodeId)) continue;
            visited.add(currNodeId);

            NodeEntity currNode = nodeById.get(currNodeId);
            if (currNode != null && !currNodeId.equals(startNode.getId())) {
                GraphDtos.DependencyChainItem item = new GraphDtos.DependencyChainItem();
                item.setDepth(depth);
                item.setRelationshipType(relType);
                item.setEntityId(currNode.getEntityId());
                item.setEntityType(currNode.getEntityType());
                item.setEntityName(currNode.getEntityName() != null ? currNode.getEntityName() : currNode.getEntityId());
                dependencyChain.add(item);
            }

            for (Object[] neighbor : reverseAdj.getOrDefault(currNodeId, List.of())) {
                String neighborId = (String) neighbor[0];
                String rel = (String) neighbor[1];
                if (!visited.contains(neighborId)) {
                    queue.add(new Object[]{neighborId, depth + 1, rel});
                }
            }
        }

        GraphDtos.DependencyResponse resp = new GraphDtos.DependencyResponse();
        resp.setId(startNode.getId());
        resp.setEntityId(startEntityId);
        resp.setDependencyChain(dependencyChain);
        resp.setImpactedCount(dependencyChain.size());
        return resp;
    }

    @Transactional(readOnly = true)
    public GraphDtos.PathResponse findDependencyPath(String from, String to) {
        if (from == null || from.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parameter 'from' is required");
        }
        if (to == null || to.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parameter 'to' is required");
        }

        Optional<NodeEntity> fromOpt = nodeRepo.findByIdOrEntityId(from.trim());
        if (fromOpt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Source entity '" + from + "' not found");
        }

        Optional<NodeEntity> toOpt = nodeRepo.findByIdOrEntityId(to.trim());
        if (toOpt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Target entity '" + to + "' not found");
        }

        NodeEntity startNode = fromOpt.get();
        NodeEntity targetNode = toOpt.get();

        GraphDtos.PathResponse response = new GraphDtos.PathResponse();
        response.setFrom(startNode.getEntityId());
        response.setTo(targetNode.getEntityId());

        // Case 5: source equals target
        if (startNode.getId().equals(targetNode.getId())) {
            response.setFound(true);
            response.setDepth(0);
            response.setNodes(List.of(toPathNodeDto(startNode)));
            response.setEdges(Collections.emptyList());
            response.setMessage("Source and target are the same entity");
            return response;
        }

        List<NodeEntity> allNodes = nodeRepo.findAll();
        Map<String, NodeEntity> nodeById = new HashMap<>();
        for (NodeEntity n : allNodes) {
            nodeById.put(n.getId(), n);
        }

        List<EdgeEntity> edges = edgeRepo.findAll();

        // Normal dependency direction: A DEPENDS_ON B means A depends on B.
        // A search from A to B follows the directed edge from A to B.
        // Supported structural relationships: DEPENDS_ON, IMPLEMENTS, CALLS, USES
        Map<String, List<EdgeEntity>> forwardAdj = new HashMap<>();
        for (EdgeEntity e : edges) {
            if (e.getRelationshipType() != null && DEPENDENCY_RELATIONSHIPS.contains(e.getRelationshipType().toUpperCase())) {
                forwardAdj.computeIfAbsent(e.getSourceId(), k -> new ArrayList<>()).add(e);
            }
        }

        // BFS to find shortest dependency path
        Set<String> visited = new HashSet<>();
        Queue<String> queue = new LinkedList<>();
        Map<String, PathStep> parentMap = new HashMap<>();

        queue.add(startNode.getId());
        visited.add(startNode.getId());

        boolean found = false;
        int maxSteps = 10000;
        int steps = 0;

        while (!queue.isEmpty() && steps < maxSteps) {
            String currNodeId = queue.poll();
            steps++;

            if (currNodeId.equals(targetNode.getId())) {
                found = true;
                break;
            }

            for (EdgeEntity edge : forwardAdj.getOrDefault(currNodeId, Collections.emptyList())) {
                String neighborId = edge.getTargetId();
                if (!visited.contains(neighborId)) {
                    visited.add(neighborId);
                    parentMap.put(neighborId, new PathStep(currNodeId, edge));
                    queue.add(neighborId);
                    if (neighborId.equals(targetNode.getId())) {
                        found = true;
                        break;
                    }
                }
            }
            if (found) {
                break;
            }
        }

        if (!found) {
            response.setFound(false);
            response.setDepth(0);
            response.setNodes(Collections.emptyList());
            response.setEdges(Collections.emptyList());
            response.setMessage("No dependency path found between '" + startNode.getEntityName() + "' and '" + targetNode.getEntityName() + "'");
            return response;
        }

        // Reconstruct path backwards from targetNode to startNode
        List<GraphDtos.PathNodeDto> pathNodes = new ArrayList<>();
        List<GraphDtos.PathEdgeDto> pathEdges = new ArrayList<>();

        String curr = targetNode.getId();
        while (!curr.equals(startNode.getId())) {
            PathStep step = parentMap.get(curr);
            if (step == null) break;
            NodeEntity node = nodeById.get(curr);
            if (node != null) {
                pathNodes.add(toPathNodeDto(node));
            }
            pathEdges.add(toPathEdgeDto(step.edge));
            curr = step.prevNodeId;
        }
        pathNodes.add(toPathNodeDto(startNode));

        // Reverse to orient from source to target
        Collections.reverse(pathNodes);
        Collections.reverse(pathEdges);

        response.setFound(true);
        response.setDepth(pathEdges.size());
        response.setNodes(pathNodes);
        response.setEdges(pathEdges);
        return response;
    }

    private GraphDtos.PathNodeDto toPathNodeDto(NodeEntity n) {
        return new GraphDtos.PathNodeDto(
                n.getId(),
                n.getEntityId(),
                n.getEntityName(),
                n.getEntityType(),
                n.getProperties() != null ? n.getProperties() : Collections.emptyMap()
        );
    }

    private GraphDtos.PathEdgeDto toPathEdgeDto(EdgeEntity e) {
        return new GraphDtos.PathEdgeDto(
                e.getId(),
                e.getSourceId(),
                e.getTargetId(),
                e.getRelationshipType(),
                e.getConfidence() != null ? e.getConfidence() : 1.0,
                e.getEvidenceRef(),
                e.getMetadataJson() != null ? e.getMetadataJson() : Collections.emptyMap()
        );
    }

    private static class PathStep {
        final String prevNodeId;
        final EdgeEntity edge;

        PathStep(String prevNodeId, EdgeEntity edge) {
            this.prevNodeId = prevNodeId;
            this.edge = edge;
        }
    }

    @Transactional(readOnly = true)
    public GraphDtos.ReverseDependencyResponse analyzeReverseDependencies(String entityId) {
        if (entityId == null || entityId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parameter 'entityId' is required");
        }

        Optional<NodeEntity> nodeOpt = nodeRepo.findByIdOrEntityId(entityId.trim());
        if (nodeOpt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Entity '" + entityId + "' not found");
        }

        NodeEntity targetNode = nodeOpt.get();

        List<NodeEntity> allNodes = nodeRepo.findAll();
        Map<String, NodeEntity> nodeById = new HashMap<>();
        for (NodeEntity n : allNodes) {
            nodeById.put(n.getId(), n);
        }

        List<EdgeEntity> edges = edgeRepo.findAll();

        // In Cortex: A DEPENDS_ON B means A depends on B (A is source, B is target).
        // Reverse dependency analysis of B finds what depends on B (incoming dependencies).
        // Supported structural relationships: DEPENDS_ON, IMPLEMENTS, CALLS, USES.
        // Reverse adjacency map: targetId -> List<EdgeEntity> (edges where target is the depended-upon entity)
        Map<String, List<EdgeEntity>> reverseAdj = new HashMap<>();
        for (EdgeEntity e : edges) {
            if (e.getRelationshipType() != null && DEPENDENCY_RELATIONSHIPS.contains(e.getRelationshipType().toUpperCase())) {
                reverseAdj.computeIfAbsent(e.getTargetId(), k -> new ArrayList<>()).add(e);
            }
        }

        // BFS traversal for reverse dependencies to discover direct and indirect callers
        Set<String> visited = new HashSet<>();
        Queue<ReverseStep> queue = new LinkedList<>();

        visited.add(targetNode.getId());
        queue.add(new ReverseStep(targetNode.getId(), 0, null));

        List<GraphDtos.DependentItemDto> dependentsList = new ArrayList<>();
        int maxSteps = 10000;
        int steps = 0;

        while (!queue.isEmpty() && steps < maxSteps) {
            ReverseStep curr = queue.poll();
            steps++;

            List<EdgeEntity> incomingEdges = reverseAdj.getOrDefault(curr.nodeId, Collections.emptyList());
            for (EdgeEntity edge : incomingEdges) {
                String dependentNodeId = edge.getSourceId();
                if (!visited.contains(dependentNodeId)) {
                    visited.add(dependentNodeId);
                    int depth = curr.depth + 1;
                    NodeEntity depNode = nodeById.get(dependentNodeId);
                    if (depNode != null) {
                        dependentsList.add(new GraphDtos.DependentItemDto(
                                depNode.getId(),
                                depNode.getEntityId(),
                                depNode.getEntityName() != null ? depNode.getEntityName() : depNode.getEntityId(),
                                depNode.getEntityType(),
                                depth,
                                edge.getRelationshipType(),
                                edge.getId(),
                                edge.getConfidence() != null ? edge.getConfidence() : 1.0,
                                edge.getEvidenceRef(),
                                edge.getMetadataJson() != null ? edge.getMetadataJson() : Collections.emptyMap()
                        ));
                    }
                    queue.add(new ReverseStep(dependentNodeId, depth, edge));
                }
            }
        }

        int directCount = 0;
        int indirectCount = 0;
        for (GraphDtos.DependentItemDto dep : dependentsList) {
            if (dep.getDepth() == 1) {
                directCount++;
            } else {
                indirectCount++;
            }
        }

        GraphDtos.ReverseDependencyResponse response = new GraphDtos.ReverseDependencyResponse();
        response.setEntity(toPathNodeDto(targetNode));
        response.setDirectDependents(directCount);
        response.setIndirectDependents(indirectCount);
        response.setTotalDependents(dependentsList.size());
        response.setDependents(dependentsList);
        return response;
    }

    private static class ReverseStep {
        final String nodeId;
        final int depth;
        final EdgeEntity edge;

        ReverseStep(String nodeId, int depth, EdgeEntity edge) {
            this.nodeId = nodeId;
            this.depth = depth;
            this.edge = edge;
        }
    }

    @Transactional(readOnly = true)
    public GraphDtos.CircularDependencyResponse detectCircularDependencies() {
        List<NodeEntity> allNodes = nodeRepo.findAll();
        if (allNodes.isEmpty()) {
            return new GraphDtos.CircularDependencyResponse(
                    0, 0, Collections.emptyList(), "Graph is empty; no entities found to analyze."
            );
        }

        Map<String, NodeEntity> nodeById = new HashMap<>();
        for (NodeEntity n : allNodes) {
            nodeById.put(n.getId(), n);
        }

        List<EdgeEntity> allEdges = edgeRepo.findAll();

        // Build outgoing edges map filtered by supported dependency relationships between existing nodes
        Map<String, List<EdgeEntity>> outgoingEdges = new HashMap<>();
        for (EdgeEntity edge : allEdges) {
            if (edge.getRelationshipType() != null &&
                    DEPENDENCY_RELATIONSHIPS.contains(edge.getRelationshipType().toUpperCase())) {
                if (nodeById.containsKey(edge.getSourceId()) && nodeById.containsKey(edge.getTargetId())) {
                    outgoingEdges.computeIfAbsent(edge.getSourceId(), k -> new ArrayList<>()).add(edge);
                }
            }
        }

        // Run Tarjan's Strongly Connected Components algorithm
        int[] indexCounter = new int[]{0};
        Map<String, Integer> indices = new HashMap<>();
        Map<String, Integer> lowlinks = new HashMap<>();
        Deque<String> stack = new ArrayDeque<>();
        Set<String> onStack = new HashSet<>();
        List<List<String>> sccList = new ArrayList<>();

        // Deterministic iteration order of nodes by entityId
        List<NodeEntity> sortedNodes = new ArrayList<>(allNodes);
        sortedNodes.sort(Comparator.comparing(NodeEntity::getEntityId, Comparator.nullsLast(String::compareTo)));

        for (NodeEntity node : sortedNodes) {
            String nodeId = node.getId();
            if (!indices.containsKey(nodeId)) {
                tarjanDfs(nodeId, outgoingEdges, indexCounter, indices, lowlinks, stack, onStack, sccList);
            }
        }

        // Filter SCCs to components that represent actual circular dependencies
        List<GraphDtos.CircularDependencyGroupDto> cyclicGroups = new ArrayList<>();

        for (List<String> scc : sccList) {
            boolean isCycle = false;
            if (scc.size() > 1) {
                isCycle = true;
            } else if (scc.size() == 1) {
                String singleNodeId = scc.get(0);
                boolean hasSelfLoop = outgoingEdges.getOrDefault(singleNodeId, Collections.emptyList())
                        .stream().anyMatch(e -> e.getTargetId().equals(singleNodeId));
                if (hasSelfLoop) {
                    isCycle = true;
                }
            }

            if (!isCycle) {
                continue;
            }

            Set<String> sccNodeIds = new HashSet<>(scc);

            // Entities involved in this cyclic component
            List<GraphDtos.PathNodeDto> entities = new ArrayList<>();
            for (String nodeId : scc) {
                NodeEntity node = nodeById.get(nodeId);
                if (node != null) {
                    entities.add(toPathNodeDto(node));
                }
            }
            entities.sort(Comparator.comparing(GraphDtos.PathNodeDto::getEntityId, Comparator.nullsLast(String::compareTo)));

            // Relationship edges strictly connecting nodes within this cyclic component
            List<GraphDtos.PathEdgeDto> edges = new ArrayList<>();
            for (String nodeId : scc) {
                for (EdgeEntity edge : outgoingEdges.getOrDefault(nodeId, Collections.emptyList())) {
                    if (sccNodeIds.contains(edge.getTargetId())) {
                        edges.add(toPathEdgeDto(edge));
                    }
                }
            }
            edges.sort(Comparator.comparing(GraphDtos.PathEdgeDto::getSourceId, Comparator.nullsLast(String::compareTo))
                    .thenComparing(GraphDtos.PathEdgeDto::getTargetId, Comparator.nullsLast(String::compareTo))
                    .thenComparing(GraphDtos.PathEdgeDto::getRelationshipType, Comparator.nullsLast(String::compareTo))
                    .thenComparing(GraphDtos.PathEdgeDto::getEdgeId, Comparator.nullsLast(String::compareTo)));

            GraphDtos.CircularDependencyGroupDto group = new GraphDtos.CircularDependencyGroupDto();
            group.setEntities(entities);
            group.setEdges(edges);
            cyclicGroups.add(group);
        }

        // Sort cyclic groups deterministically: by size descending, then by first entity's entityId ascending
        cyclicGroups.sort((g1, g2) -> {
            int sizeCmp = Integer.compare(g2.getEntities().size(), g1.getEntities().size());
            if (sizeCmp != 0) return sizeCmp;
            String id1 = g1.getEntities().isEmpty() ? "" : g1.getEntities().get(0).getEntityId();
            String id2 = g2.getEntities().isEmpty() ? "" : g2.getEntities().get(0).getEntityId();
            return id1.compareTo(id2);
        });

        // Assign stable cycle identifiers
        for (int i = 0; i < cyclicGroups.size(); i++) {
            cyclicGroups.get(i).setId("cycle-" + (i + 1));
        }

        int totalCycles = cyclicGroups.size();
        int totalCyclicEntities = cyclicGroups.stream().mapToInt(g -> g.getEntities().size()).sum();
        String message;
        if (totalCycles == 0) {
            message = "No circular dependencies found.";
        } else {
            message = String.format("Found %d circular dependency group(s) involving %d entities.", totalCycles, totalCyclicEntities);
        }

        return new GraphDtos.CircularDependencyResponse(totalCycles, totalCyclicEntities, cyclicGroups, message);
    }

    private void tarjanDfs(
            String u,
            Map<String, List<EdgeEntity>> outgoingEdges,
            int[] indexCounter,
            Map<String, Integer> indices,
            Map<String, Integer> lowlinks,
            Deque<String> stack,
            Set<String> onStack,
            List<List<String>> sccList) {

        indices.put(u, indexCounter[0]);
        lowlinks.put(u, indexCounter[0]);
        indexCounter[0]++;
        stack.push(u);
        onStack.add(u);

        List<EdgeEntity> edges = outgoingEdges.getOrDefault(u, Collections.emptyList());
        for (EdgeEntity edge : edges) {
            String v = edge.getTargetId();
            if (!indices.containsKey(v)) {
                tarjanDfs(v, outgoingEdges, indexCounter, indices, lowlinks, stack, onStack, sccList);
                lowlinks.put(u, Math.min(lowlinks.get(u), lowlinks.get(v)));
            } else if (onStack.contains(v)) {
                lowlinks.put(u, Math.min(lowlinks.get(u), indices.get(v)));
            }
        }

        if (lowlinks.get(u).equals(indices.get(u))) {
            List<String> scc = new ArrayList<>();
            while (true) {
                String popped = stack.pop();
                onStack.remove(popped);
                scc.add(popped);
                if (popped.equals(u)) {
                    break;
                }
            }
            sccList.add(scc);
        }
    }

    @Transactional(readOnly = true)
    public GraphDtos.ChangeImpactResponse analyzeChangeImpact(String entityId) {
        if (entityId == null || entityId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Parameter 'entityId' is required");
        }

        List<NodeEntity> allNodes = nodeRepo.findAll();
        if (allNodes.isEmpty()) {
            return new GraphDtos.ChangeImpactResponse(
                    null, 0, 0, 0, 0, 0, 0, 0, 0,
                    Collections.emptyMap(), false, Collections.emptyList(),
                    "Graph is empty; no entities found to analyze."
            );
        }

        Optional<NodeEntity> nodeOpt = nodeRepo.findByIdOrEntityId(entityId.trim());
        if (nodeOpt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Entity '" + entityId + "' not found");
        }

        NodeEntity targetNode = nodeOpt.get();

        // Reuse reverse dependency analysis for canonical incoming dependent traversal
        GraphDtos.ReverseDependencyResponse reverseResp = analyzeReverseDependencies(entityId);
        List<GraphDtos.DependentItemDto> dependents = reverseResp.getDependents();

        int maxDepth = 0;
        int affectedControllers = 0;
        int affectedServices = 0;
        int affectedRepositories = 0;
        Set<String> distinctPackages = new HashSet<>();
        Map<String, Integer> byType = new LinkedHashMap<>();

        Map<String, NodeEntity> nodeById = new HashMap<>();
        for (NodeEntity n : allNodes) {
            nodeById.put(n.getId(), n);
        }

        for (GraphDtos.DependentItemDto dep : dependents) {
            if (dep.getDepth() > maxDepth) {
                maxDepth = dep.getDepth();
            }

            String type = dep.getEntityType() != null ? dep.getEntityType() : "Unknown";
            byType.put(type, byType.getOrDefault(type, 0) + 1);

            String lowerType = type.toLowerCase();
            if (lowerType.contains("controller")) {
                affectedControllers++;
            } else if (lowerType.contains("service")) {
                affectedServices++;
            } else if (lowerType.contains("repository")) {
                affectedRepositories++;
            }

            NodeEntity depNode = nodeById.get(dep.getNodeId());
            if (depNode != null && depNode.getProperties() != null && depNode.getProperties().containsKey("package")) {
                Object pkgObj = depNode.getProperties().get("package");
                if (pkgObj != null && !pkgObj.toString().isBlank()) {
                    distinctPackages.add(pkgObj.toString());
                }
            } else if (dep.getEntityId() != null && dep.getEntityId().contains(".")) {
                String pkg = dep.getEntityId().substring(0, dep.getEntityId().lastIndexOf('.'));
                if (!pkg.isBlank()) {
                    distinctPackages.add(pkg);
                }
            }
        }

        // Check if target node participates in any detected circular dependency
        boolean inCycle = false;
        GraphDtos.CircularDependencyResponse cycleResp = detectCircularDependencies();
        for (GraphDtos.CircularDependencyGroupDto group : cycleResp.getCircularDependencies()) {
            for (GraphDtos.PathNodeDto n : group.getEntities()) {
                if (targetNode.getId().equals(n.getId()) ||
                    (targetNode.getEntityId() != null && targetNode.getEntityId().equals(n.getEntityId()))) {
                    inCycle = true;
                    break;
                }
            }
            if (inCycle) break;
        }

        String entityName = targetNode.getEntityName() != null ? targetNode.getEntityName() : targetNode.getEntityId();
        String message;
        if (dependents.isEmpty()) {
            message = "No dependents found for entity '" + entityName + "'.";
        } else {
            message = String.format("Change impact analysis complete: %d dependent(s) affected across %d level(s).",
                    dependents.size(), maxDepth);
        }

        return new GraphDtos.ChangeImpactResponse(
                reverseResp.getEntity(),
                reverseResp.getDirectDependents(),
                reverseResp.getIndirectDependents(),
                reverseResp.getTotalDependents(),
                maxDepth,
                affectedControllers,
                affectedServices,
                affectedRepositories,
                distinctPackages.size(),
                byType,
                inCycle,
                dependents,
                message
        );
    }
}
