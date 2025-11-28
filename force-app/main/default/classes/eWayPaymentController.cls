/**
 * @description       : 
 * @author            : jamesperram@gmail.com
 * @group             : 
 * @last modified on  : 11-28-2025
 * @last modified by  : jamesperram@gmail.com
**/
public with sharing class eWayPaymentController {

    @AuraEnabled
    public static String processPayment(String securedCardData, Integer amountInCents, String firstName, String lastName, String email) {
        // Validate basic inputs
        if (String.isBlank(securedCardData)) {
            throw new AuraHandledException('Payment token missing');
        }
        if (amountInCents == null || amountInCents <= 0) {
            throw new AuraHandledException('Invalid amount');
        }

        try {
            HttpRequest req = new HttpRequest();
            // Use the Named Credential defined in Phase 1
            req.setEndpoint('callout:eWay_Sandbox/Transaction');
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');

            // Build Customer object only if provided
            Map<String, Object> customer = new Map<String, Object>();
            if (!String.isBlank(firstName)) customer.put('FirstName', firstName);
            if (!String.isBlank(lastName)) customer.put('LastName', lastName);
            if (!String.isBlank(email)) customer.put('Email', email);

            // Several eWAY validation codes require the EWAY_CARDHOLDERNAME to be present
            // When using SecuredCardData we still should provide the cardholder name in
            // `Customer.CardDetails.Name` (this avoids validation error V6021).
            if (!String.isBlank(firstName) || !String.isBlank(lastName)) {
                String cardholderName = (String.isBlank(firstName) ? '' : firstName + ' ') + (String.isBlank(lastName) ? '' : lastName);
                cardholderName = cardholderName.trim();
                Map<String, Object> cardDetails = new Map<String, Object>{'Name' => cardholderName};
                customer.put('CardDetails', cardDetails);
            }

            // Construct Payload
            Map<String, Object> payload = new Map<String, Object>{
                    'Payment' => new Map<String, Object>{
                        'TotalAmount' => amountInCents,
                        'InvoiceNumber' => 'INV-' + String.valueOf(System.currentTimeMillis()), // Simple unique ID for POC
                        'CurrencyCode' => 'AUD'
                },
                'SecuredCardData' => securedCardData,
                'TransactionType' => 'Purchase',
                'Method' => 'ProcessPayment'
            };

            if (!customer.isEmpty()) {
                payload.put('Customer', customer);
            }

            req.setBody(JSON.serialize(payload));

            Http http = new Http();
            HttpResponse res = http.send(req);

            // Return a consistent response shape for the LWC
            Map<String, Object> result = new Map<String, Object>();
            if (res.getStatusCode() == 200) {
                Map<String, Object> responseMap = (Map<String, Object>)JSON.deserializeUntyped(res.getBody());
                Boolean txnStatus = responseMap.containsKey('TransactionStatus') ? (Boolean)responseMap.get('TransactionStatus') : false;
                Integer txnId = responseMap.containsKey('TransactionID') ? (Integer)responseMap.get('TransactionID') : null;
                String authCode = responseMap.containsKey('AuthorisationCode') ? String.valueOf(responseMap.get('AuthorisationCode')) : null;
                String responseCode = responseMap.containsKey('ResponseCode') ? String.valueOf(responseMap.get('ResponseCode')) : null;
                String responseMessage = responseMap.containsKey('ResponseMessage') ? String.valueOf(responseMap.get('ResponseMessage')) : null;
                // If an Errors field exists, try to decode into readable message
                if(responseMap.containsKey('Errors') && responseMap.get('Errors') != null) {
                    String errors = String.valueOf(responseMap.get('Errors'));
                    // eWAY uses comma-separated validation/error codes like 'V6021' or 'D4405'
                    String[] errorCodes = errors.split(',');
                    // Map a few common validation codes to friendly messages
                    Map<String, String> validationMessages = new Map<String, String>{
                        'V6021' => 'Cardholder name is required',
                        'V6022' => 'Card number is required',
                        'V6023' => 'Card CVN is required',
                        'V6011' => 'Invalid payment amount',
                        'V6148' => 'Secure field token expired, please re-enter card details'
                    };

                    // If responseMessage empty, prefer errors mapping
                    if(String.isBlank(responseMessage)) {
                        List<String> parts = new List<String>();
                        for(String code : errorCodes) {
                            String friendly = validationMessages.get(code.trim());
                            if(friendly == null) {
                                // fallback to raw code
                                parts.add(code.trim());
                            } else {
                                parts.add(friendly);
                            }
                        }
                        responseMessage = String.join(parts, ', ');
                    }
                    // Set responseCode to first code if not present
                    if(String.isBlank(responseCode) && errorCodes.size() > 0) {
                        responseCode = errorCodes[0].trim();
                    }
                }

                result.put('success', txnStatus);
                result.put('transactionId', txnId);
                result.put('authorizationCode', authCode);
                result.put('responseCode', responseCode);
                result.put('responseMessage', responseMessage);
                result.put('rawResponse', responseMap);

                return JSON.serialize(result);
            } else {
                // Build sanitized error response
                result.put('success', false);
                result.put('responseCode', String.valueOf(res.getStatus()));
                result.put('responseMessage', res.getBody());
                result.put('rawResponse', res.getBody());
                return JSON.serialize(result);
            }
        } catch (Exception e) {
            // Avoid logging securedCardData. Log general exception and return a sanitized message
            System.debug('Payment processing exception: ' + e.getMessage());
            throw new AuraHandledException('Payment processing failed: ' + e.getMessage());
        }
    }
}
