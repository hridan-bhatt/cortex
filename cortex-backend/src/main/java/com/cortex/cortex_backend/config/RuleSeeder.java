package com.cortex.cortex_backend.config;

import com.cortex.cortex_backend.entity.RuleEntity;
import com.cortex.cortex_backend.repository.RuleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;


@Component
public class RuleSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RuleSeeder.class);

    private final RuleRepository ruleRepository;

    public RuleSeeder(RuleRepository ruleRepository) {
        this.ruleRepository = ruleRepository;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (ruleRepository.count() > 0) {
            log.info("Cortex: Rules already seeded ({} rules present).", ruleRepository.count());
            return;
        }

        List<RuleEntity> builtinRules = List.of(
            buildRule(
                "rule_dependency_impact",
                "Dependency Failure Impact",
                Map.of("relationship", "DEPENDS_ON", "target_status", List.of("FAILED", "REMOVED", "IMPACTED")),
                "ASSERT_IMPACTED",
                1
            ),
            buildRule(
                "rule_transitive_dependency",
                "Transitive Dependency Propagation",
                Map.of("relationship", "DEPENDS_ON"),
                "ASSERT_TRANSITIVE_DEPENDS_ON",
                2
            ),
            buildRule(
                "rule_conflict_interaction",
                "Conflict Interaction Rule",
                Map.of("relationship", "CONFLICTS_WITH"),
                "ASSERT_CONFLICT_DETECTED",
                3
            ),
            buildRule(
                "rule_implementation_impact",
                "Implementation Target Impact",
                Map.of("relationship", "IMPLEMENTS", "target_status", List.of("FAILED", "REMOVED", "IMPACTED", "MODIFIED")),
                "ASSERT_IMPACTED",
                4
            )
        );

        ruleRepository.saveAll(builtinRules);
        log.info("Cortex: Seeded {} built-in reasoning rules.", builtinRules.size());
    }

    private RuleEntity buildRule(String id, String name, Map<String, Object> conditionVocab,
                                  String actionType, int firingOrder) {
        RuleEntity rule = new RuleEntity();
        rule.setId(id);
        rule.setRuleName(name);
        rule.setConditionVocab(conditionVocab);
        rule.setActionType(actionType);
        rule.setFiringOrder(firingOrder);
        return rule;
    }
}
