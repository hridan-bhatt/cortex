package com.fixture.inventory;

import com.fixture.orders.OrderService;
import com.fixture.audit.AuditLog;

public class InventoryService {

    private OrderService orderService;
    private AuditLog auditLog;

    public void checkInventory() {
        if (orderService != null) {
            orderService.processOrder();
        }
        if (auditLog != null) {
            auditLog.logEvent();
        }
    }
}
