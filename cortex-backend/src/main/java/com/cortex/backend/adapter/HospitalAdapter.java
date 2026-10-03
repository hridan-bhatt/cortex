package com.cortex.backend.adapter;

import java.util.*;


public class HospitalAdapter implements DomainAdapter {

    // ─── Built-in Hospital Dataset ────────────────────────────────────────────

    private static final List<Map<String, Object>> DEFAULT_PATIENTS = List.of(
        Map.of("id", "PAT_101", "name", "John Doe", "conditions", List.of("Hypertension", "Heart Failure")),
        Map.of("id", "PAT_102", "name", "Jane Smith", "conditions", List.of("Diabetes Type 2", "Chronic Kidney Disease")),
        Map.of("id", "PAT_103", "name", "Alice Johnson", "conditions", List.of("Asthma", "Arrhythmia"))
    );

    private static final List<Map<String, Object>> DEFAULT_MEDICATIONS = List.of(
        Map.of("id", "MED_WARFARIN", "name", "Warfarin", "class", "Anticoagulant"),
        Map.of("id", "MED_ASPIRIN", "name", "Aspirin", "class", "NSAID / Antiplatelet"),
        Map.of("id", "MED_LISINOPRIL", "name", "Lisinopril", "class", "ACE Inhibitor"),
        Map.of("id", "MED_METFORMIN", "name", "Metformin", "class", "Antidiabetic"),
        Map.of("id", "MED_SPIRONOLACTONE", "name", "Spironolactone", "class", "Diuretic")
    );

    private static final List<Map<String, Object>> DEFAULT_PRESCRIPTIONS = List.of(
        Map.of("patient_id", "PAT_101", "medication_id", "MED_WARFARIN", "dosage", "5mg daily"),
        Map.of("patient_id", "PAT_101", "medication_id", "MED_ASPIRIN", "dosage", "81mg daily"),
        Map.of("patient_id", "PAT_102", "medication_id", "MED_LISINOPRIL", "dosage", "10mg daily"),
        Map.of("patient_id", "PAT_102", "medication_id", "MED_SPIRONOLACTONE", "dosage", "25mg daily"),
        Map.of("patient_id", "PAT_103", "medication_id", "MED_METFORMIN", "dosage", "500mg twice daily")
    );

    private static final List<Map<String, Object>> DEFAULT_INTERACTION_RULES = List.of(
        Map.of("med1", "MED_WARFARIN", "med2", "MED_ASPIRIN", "severity", "CRITICAL",
               "description", "High bleeding risk when combining Anticoagulant with NSAID"),
        Map.of("med1", "MED_LISINOPRIL", "med2", "MED_SPIRONOLACTONE", "severity", "HIGH",
               "description", "Hyperkalemia risk when combining ACE inhibitor with potassium-sparing diuretic")
    );

    // ─── Instance ─────────────────────────────────────────────────────────────

    private final List<Map<String, Object>> patients;
    private final List<Map<String, Object>> medications;
    private final List<Map<String, Object>> prescriptions;
    private final List<Map<String, Object>> interactionRules;

    /** Default constructor uses built-in dataset. */
    public HospitalAdapter() {
        this.patients = DEFAULT_PATIENTS;
        this.medications = DEFAULT_MEDICATIONS;
        this.prescriptions = DEFAULT_PRESCRIPTIONS;
        this.interactionRules = DEFAULT_INTERACTION_RULES;
    }

    /** Custom dataset constructor. */
    @SuppressWarnings("unchecked")
    public HospitalAdapter(Map<String, Object> dataset) {
        if (dataset == null) {
            this.patients = DEFAULT_PATIENTS;
            this.medications = DEFAULT_MEDICATIONS;
            this.prescriptions = DEFAULT_PRESCRIPTIONS;
            this.interactionRules = DEFAULT_INTERACTION_RULES;
        } else {
            this.patients = (List<Map<String, Object>>) dataset.getOrDefault("patients", DEFAULT_PATIENTS);
            this.medications = (List<Map<String, Object>>) dataset.getOrDefault("medications", DEFAULT_MEDICATIONS);
            this.prescriptions = (List<Map<String, Object>>) dataset.getOrDefault("prescriptions", DEFAULT_PRESCRIPTIONS);
            this.interactionRules = (List<Map<String, Object>>) dataset.getOrDefault("interaction_rules", DEFAULT_INTERACTION_RULES);
        }
    }

    @Override
    public String getId() {
        return "hospital";
    }

    @Override
    public String getName() {
        return "Hospital Healthcare Domain Adapter";
    }

    @Override
    public String getDescription() {
        return "Healthcare domain adapter mapping patients, medications, and prescriptions into the Cortex graph";
    }

    @Override
    public String getSupportedDomain() {
        return "Healthcare EMR";
    }

    @Override
    public List<Map<String, Object>> extractEntities() {
        List<Map<String, Object>> entities = new ArrayList<>();

        // 1. Patient entities
        for (Map<String, Object> pat : patients) {
            entities.add(Map.of(
                "type", "Patient",
                "id", pat.get("id"),
                "name", pat.get("name"),
                "properties", Map.of("conditions", pat.getOrDefault("conditions", List.of()))
            ));
        }

        // 2. Medication entities
        for (Map<String, Object> med : medications) {
            entities.add(Map.of(
                "type", "Medication",
                "id", med.get("id"),
                "name", med.get("name"),
                "properties", Map.of("class", med.getOrDefault("class", ""))
            ));
        }

        // 3. Prescription entities
        for (Map<String, Object> rx : prescriptions) {
            String rxId = "RX:" + rx.get("patient_id") + ":" + rx.get("medication_id");
            entities.add(Map.of(
                "type", "Prescription",
                "id", rxId,
                "name", "Prescription " + rx.get("medication_id") + " for " + rx.get("patient_id"),
                "properties", Map.of("dosage", rx.getOrDefault("dosage", ""))
            ));
        }

        return entities;
    }

    @Override
    public List<Map<String, Object>> extractRelationships() {
        List<Map<String, Object>> rels = new ArrayList<>();

        for (Map<String, Object> rx : prescriptions) {
            String rxId = "RX:" + rx.get("patient_id") + ":" + rx.get("medication_id");
            String patientId = (String) rx.get("patient_id");
            String medicationId = (String) rx.get("medication_id");

            // Patient OWNS Prescription
            rels.add(rel("Patient", patientId, "Prescription", rxId, "OWNS", 1.0,
                    "prescription_record:" + rxId, Map.of("dosage", rx.getOrDefault("dosage", ""))));

            // Prescription IMPLEMENTS Medication
            rels.add(rel("Prescription", rxId, "Medication", medicationId, "IMPLEMENTS", 1.0,
                    "prescription_record:" + rxId, Map.of("medication", medicationId)));

            // Patient DEPENDS_ON Medication (for treatment)
            rels.add(rel("Patient", patientId, "Medication", medicationId, "DEPENDS_ON", 1.0,
                    "prescription_record:" + rxId, Map.of("treatment", "active_prescription")));
        }

        // Drug interaction rules → Medication CONFLICTS_WITH Medication
        for (Map<String, Object> rule : interactionRules) {
            String med1 = (String) rule.get("med1");
            String med2 = (String) rule.get("med2");
            rels.add(rel("Medication", med1, "Medication", med2, "CONFLICTS_WITH", 1.0,
                    "pharmacology_db:" + med1 + "_" + med2,
                    Map.of("severity", rule.getOrDefault("severity", "HIGH"),
                           "description", rule.getOrDefault("description", ""))));
        }

        return rels;
    }

    @Override
    public List<Map<String, Object>> extractEvents() {
        List<Map<String, Object>> events = new ArrayList<>();
        for (Map<String, Object> rx : prescriptions) {
            String rxId = "RX:" + rx.get("patient_id") + ":" + rx.get("medication_id");
            events.add(Map.of(
                "type", "PRESCRIPTION",
                "entity_id", rx.get("patient_id"),
                "timestamp", "2026-07-31T00:00:00Z",
                "source", "hospital_emr:" + rxId,
                "details", Map.of(
                    "patient_id", rx.get("patient_id"),
                    "medication_id", rx.get("medication_id"),
                    "dosage", rx.getOrDefault("dosage", "")
                )
            ));
        }
        return events;
    }

    // ─── Helper ───────────────────────────────────────────────────────────────

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
        m.put("metadata", metadata);
        return m;
    }
}
