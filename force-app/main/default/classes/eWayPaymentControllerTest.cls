@isTest
private class eWayPaymentControllerTest {

    // Simple Mock implementation to simulate eWAY return with V6021 error
    private class ErrorV6021Mock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setHeader('Content-Type', 'application/json');
            res.setBody('{"Errors":"V6021","Payment":{"TotalAmount":1000,"CurrencyCode":"AUD"}}');
            return res;
        }
    }

    @isTest static void testProcessPaymentV6021() {
        Test.setMock(HttpCalloutMock.class, new ErrorV6021Mock());

        // Call into Apex with a valid token and customer name/email
        String securedToken = 'dummyToken12345';
        Integer amount = 1000;
        String firstName = 'Test';
        String lastName = 'User';
        String email = 'test@example.com';

        Test.startTest();
        String result = eWayPaymentController.processPayment(securedToken, amount, firstName, lastName, email);
        Test.stopTest();

        System.assertNotEquals(null, result, 'Expected a JSON response from the controller');
        Map<String, Object> resp = (Map<String, Object>) JSON.deserializeUntyped(result);
        // The mock returns the V6021 error so response should include friendly message
        System.assertEquals('Cardholder name is required', resp.get('responseMessage'));
        System.assertEquals('V6021', resp.get('responseCode'));
    }
}
