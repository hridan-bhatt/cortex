package com.cortex.cortex_backend.service;

import com.cortex.cortex_backend.dto.GraphDtos;
import com.cortex.cortex_backend.entity.EdgeEntity;
import com.cortex.cortex_backend.entity.NodeEntity;
import com.cortex.cortex_backend.repository.EdgeRepository;
import com.cortex.cortex_backend.repository.NodeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;


@Service
public class GraphTraversalService {

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
}
