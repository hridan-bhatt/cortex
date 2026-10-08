package com.fixture.orders;

import com.fixture.inventory.InventoryService;
import com.fixture.payments.PaymentService;

public class OrderService {

    private InventoryService inventoryService;
    private PaymentService paymentService;

    public void processOrder() {
        if (inventoryService != null) {
            inventoryService.checkInventory();
        }
        if (paymentService != null) {
            paymentService.processPayment();
        }
    }
}
