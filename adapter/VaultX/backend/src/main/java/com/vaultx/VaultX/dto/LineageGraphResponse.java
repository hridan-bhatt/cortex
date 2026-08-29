package com.vaultx.VaultX.dto;

import lombok.*;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LineageGraphResponse {

    private List<NodeDto> nodes;
    private List<EdgeDto> edges;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class NodeDto {
        private String id;
        private String type; // 'owner', 'file', 'share', 'recipient', 'copy'
        private String label;
        private Object data;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class EdgeDto {
        private String id;
        private String source;
        private String target;
        private String label;
        private boolean animated;
    }
}
