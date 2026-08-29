package com.cortex.cortex_backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;


@ConfigurationProperties(prefix = "cortex")
public class CortexProperties {

    private String projectName = "Project Cortex Runtime";
    private String version = "1.1";
    private String vaultxPath = "../../adapter/VaultX";

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
