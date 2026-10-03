package com.cortex.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;


@ConfigurationProperties(prefix = "cortex")//this tells applicationProperties to find every property that starts with cortex and then map that property to fields in this class.
public class CortexProperties {
    //this is a bridge between application.properties and the rest of the application which is services,controllers,etc.
    //application.properties is a file with settings and CortexProperties is a settings reader.
    //application.properties->CortexProperties->Injected into Services.
    //raw text--------------->typed object----->e.g. IngestionService
    private String projectName = "Project Cortex Runtime";
    private String version = "1.1";
    private String vaultxPath = "../../adapter/VaultX";//VaultX is at this path but spring boot is running from backend/ and the JVM's working directory might be different so ../../ covers both the cases

    public String getProjectName() {
        return projectName;
    }
    public void setProjectName(String projectName) {
        this.projectName = projectName;
    }

    public String getVersion() {
        return version;
    }
    public void setVersion(String version) {
        this.version = version;
    }

    public String getVaultxPath() {
        return vaultxPath;
    }
    public void setVaultxPath(String vaultxPath) {
        this.vaultxPath = vaultxPath;
    }
}
