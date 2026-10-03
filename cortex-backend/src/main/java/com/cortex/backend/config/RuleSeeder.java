package com.cortex.backend.config;

import com.cortex.backend.entity.RuleEntity;
import com.cortex.backend.repository.RuleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

//on startup, it checks if any rules exist in the db.if none exist, it inserts the default rules. if rules already exist, it does nothing.
//the reasoning engine needs rules to work. Without rules, /reason does nothing because it has no conditions to match against facts.
//this file does this: rules already stored in the database->first startup-> seed them during the first startup.
@Component
public class RuleSeeder implements ApplicationRunner {//ApplicationRunner is a spring boot interface with 1 method.

    private static final Logger log = LoggerFactory.getLogger(RuleSeeder.class);//used to log messages to the console.

    private final RuleRepository ruleRepository;

    public RuleSeeder(RuleRepository ruleRepository) {
        this.ruleRepository = ruleRepository;
    }//It is the JPA Repository for RuleEntity used to count()-check how many rules exist and saveAll()-save all built-in rules at once.

    @Override
    public void run(ApplicationArguments args) {
        if (ruleRepository.count() > 0) {//if the DB already has rules-which means count>0, skip seeding.
            log.info("Cortex: Rules already seeded ({} rules present).", ruleRepository.count());
            return;//this method prevents dupe rule on every restart.
        }//if run() is executed, the work for this file is done, else it creates the 4 default rules and seeds them.

        List<RuleEntity> builtinRules = List.of(
                //these are the 4 default rules that get seeded into the DB if there are no rules already in the DB.
            buildRule(
                "rule_dependency_impact",
                "Dependency Failure Impact",
                Map.of("relationship", "DEPENDS_ON", "target_status", List.of("FAILED", "REMOVED", "IMPACTED")),
                "ASSERT_IMPACTED",
                1
                    //A depends on B, B is FAILED/REMOVED or already IMPACTED, A's status becomes IMPACTED.
            ),
            buildRule(
                "rule_transitive_dependency",
                "Transitive Dependency Propagation",
                Map.of("relationship", "DEPENDS_ON"),
                "ASSERT_TRANSITIVE_DEPENDS_ON",
                2
                    //A depends on B, B depends on C, then A transitively depends on C.
            ),
            buildRule(
                "rule_conflict_interaction",
                "Conflict Interaction Rule",
                Map.of("relationship", "CONFLICTS_WITH"),
                "ASSERT_CONFLICT_DETECTED",
                3
                    //if A conflicts with B, flag a conflict.
            ),
            buildRule(
                "rule_implementation_impact",
                "Implementation Target Impact",
                Map.of("relationship", "IMPLEMENTS", "target_status", List.of("FAILED", "REMOVED", "IMPACTED", "MODIFIED")),
                "ASSERT_IMPACTED",
                4
                    //if A implements B, and B's status is FAILED/REMOVED/IMPACTED/MODIFIED, then A is impacted.
            )
        );

        ruleRepository.saveAll(builtinRules);
        log.info("Cortex: Seeded {} built-in reasoning rules.", builtinRules.size());//saves all 4 rules to the DB in one transaction and then logs.
    }



    //this is the Helper to create the rules.
    //this same helper is used in the above rule creation list.
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

    //Application Startup
    //      │
    //      ▼
    //RuleSeeder.run()
    //      │
    //      ├── Checks RuleRepository.count()
    //      │       │
    //      │       ├── If > 0: skip
    //      │       │
    //      │       └── If 0: save 4 rules to DB
    //      │
    //      ▼
    //RuleEntity rows in database
    //      │
    //      ▼
    //ForwardChainingService reads them at /reason time
    //      │
    //      ▼
    //Rules are matched against facts → new facts inferred
}
