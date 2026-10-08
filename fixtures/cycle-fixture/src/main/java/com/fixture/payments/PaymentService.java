package com.fixture.payments;

import com.fixture.orders.OrderService;
import com.fixture.inventory.InventoryService;

public class PaymentService {

    private OrderService orderService;
    private InventoryService inventoryService;

    public void processPayment() {
        if (orderService != null) {
            orderService.processOrder();
        }
        if (inventoryService != null) {
            inventoryService.checkInventory();
        }
    }
}
