package com.cortex.backend.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.Map;


public class IngestDtos {

    public static class IngestRequest {

        private String adapter;//Adapter name: "vaultx" or "hospital"

        private Map<String, Object> data;//Optional override options

        public String getAdapter() { return adapter; }
        public void setAdapter(String adapter) { this.adapter = adapter; }
        public Map<String, Object> getData() { return data; }
        public void setData(Map<String, Object> data) { this.data = data; }
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class IngestResponse {
        private int entitiesIngested;
        private int relationshipsIngested;
        private int eventsIngested = 0;
        private String message = "Ingestion completed successfully";

        public IngestResponse() {}

        public IngestResponse(int entitiesIngested, int relationshipsIngested, int eventsIngested, String message) {
            this.entitiesIngested = entitiesIngested;
            this.relationshipsIngested = relationshipsIngested;
            this.eventsIngested = eventsIngested;
            this.message = message;
        }

        public int getEntitiesIngested() { return entitiesIngested; }
        public void setEntitiesIngested(int entitiesIngested) { this.entitiesIngested = entitiesIngested; }
        public int getRelationshipsIngested() { return relationshipsIngested; }
        public void setRelationshipsIngested(int relationshipsIngested) { this.relationshipsIngested = relationshipsIngested; }
        public int getEventsIngested() { return eventsIngested; }
        public void setEventsIngested(int eventsIngested) { this.eventsIngested = eventsIngested; }
        public String getMessage() { return message; }
        public void setMessage(String message) { this.message = message; }
    }
}
