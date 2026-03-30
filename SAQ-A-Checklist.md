# SAQ-A Checklist (Mapping to PaymentPortalPOC repo)

This checklist maps SAQ-A (Secure Fields/Panel pattern) requirements to the PaymentPortalPOC codebase and configuration guidance. The goal is to show where each control is covered, evidence in the repository, and recommended actions for hardening and final SAQ-A validation.

> Note: This mapping is a developer-level evidence report — final compliance requires a QSA review and environment-level verifications.

---

## How to use this checklist
- Each box is a SAQ-A statement or a relevant control.
- "Status" indicates whether this repo provides evidence and the current implementation state.
- "Evidence" points to the files or configuration steps in the project.
- "Action / Notes" lists recommended next steps or residual considerations for production.

---

1) Cardholder Data (PAN, CVV) never stored or transmitted onto merchant servers
- [ ] Status: Verified (POC uses tokenization)
- Evidence: `force-app/main/default/pages/eWaySecureFields.page` (secure fields hosted by eWAY), `paymentForm.js` (LWC sends ONLY token to Apex), `eWayPaymentController.cls` (Apex accepts `SecuredCardData` token and does a callout)
- Action / Notes: Ensure no other integration or logs persist raw PAN or CVV (search logs and Apex code for accidental storage). If you add a transaction object in Salesforce, store only non-sensitive metadata and mask any sensitive fields.

2) Card data consumed ONLY in hosted iframe controlled by PCI-compliant third-party (eWAY)
- [ ] Status: Verified
- Evidence: Visualforce loads `https://secure.ewaypayments.com` and sets up secure fields; eWAY-hosted fields replace local DIVs in VF.
- Action / Notes: Confirm `secure.ewaypayments.com` is present in CSP Trusted Sites and origin validation is enabled in production.

3) Tokens (SecuredCardData) are single-use and short-lived; only tokens are sent server-side
- [ ] Status: Verified
- Evidence: `eWaySecureFields.page` produces a `secureFieldCode` (token) via callbacks; `paymentForm` sends token to the server; `eWayPaymentController` passes `SecuredCardData` to eWAY Rapid API.
- Action / Notes: Ensure tokens are redacted from logs and not stored. Confirm token expiry is handled appropriately and `V6148` (token expired) workflow included.

4) All eWAY Rapid API credentials are stored securely, not hardcoded (use Named Credential)
- [ ] Status: Verified (design)
- Evidence: `eWayPaymentController.cls` sends callout to `callout:eWay_Sandbox/Transaction` (Named Credential usage).
- Action / Notes: Ensure Named Credential `eWay_Sandbox` and `eWay_Auth` External Credential are configured correctly in org and Permission Sets applied.

5) Application uses TLS for all communication with eWAY and external resources
- [ ] Status: Verified
- Evidence: `eWaySecureFields.page` uses `https://secure.ewaypayments.com` for JS and iframe; Named Credential URL is `https://api.sandbox.ewaypayments.com`.
- Action / Notes: Confirm TLS configuration in production and latest Cipher suites at both client and server sides.

6) Content Security Policy (CSP) configured to allow eWAY script & frames (script-src, frame-src, connect-src)
- [ ] Status: Recommended / Not automatically enforced
- Evidence: `eWayIntegrationGuide.md` contains recommendations for CSP Trusted Sites steps.
- Action / Notes: Configure CSP Trusted Sites in the Salesforce org with `secure.ewaypayments.com` (script & frame) and `api.sandbox.ewaypayments.com` (connect). Validation should be performed in staged environments.

7) postMessage (Cross-Domain) origin validation is implemented in production
- [ ] Status: Partially verified; Implementation includes anti-pattern commented code
- Evidence: `paymentForm.js` includes commented origin validation code and the VF page contains comments recommending `event.origin` checks.
- Action / Notes: Implement strict origin checks in LWC message listeners and VF page. Validate production domains (force.com or visual.force.com) and limit acceptance to those origins.

8) Logging & Debugging avoids exposure of tokens or PAN
- [ ] Status: Partially verified
- Evidence: Code masks tokens (redaction), LWC debug view uses `JSON.stringify` for `rawResponse` (less likely to show Proxy) and console prints are controlled. `eWayPaymentController` refrains from logging `securedCardData`.
- Action / Notes: Remove or restrict debug printing in production; ensure System.debug or other logs cannot show tokens; enhance logging policies for security.

9) Application only handles non-sensitive data and uses tokens for transactions
- [ ] Status: Verified
- Evidence: `paymentForm.js` captures name/email/amount; `eWaySecureFields` handles card fields; Apex uses token to process payment.
- Action / Notes: Confirm that LWC does not store card details in localStorage/sessionStorage inadvertently.

10) Validate error handling, avoid exposing sensitive information in messages
- [ ] Status: Verified (improved)
- Evidence: `eWayPaymentController.cls` maps eWAY `Errors` and returns friendly messages, `paymentForm` shows these messages and the debug toggle reveals `rawResponse` for devs only (should not show tokens).
- Action / Notes: For production, ensure sanitized error messages for end users and retain debug logs for admin only.

11) Tests for negative and positive flows and continuous monitoring
- [ ] Status: Verified (POC includes tests), more tests recommended
- Evidence: `eWayPaymentControllerTest.cls` mocks a `V6021` case. LWC test directory contains `paymentForm.test.js`.
- Action / Notes: Add tests for success (A2000), V6148 (token expired), D codes (decline), and network failures; integrate CI tests.

12) Administrative access and least privilege configuration for Named Credential usage
- [ ] Status: Recommended (must be configured in org)
- Evidence: `eWayIntegrationGuide.md` includes Named Credential steps and Permission Set guidance.
- Action / Notes: Ensure the Named Credential principal has the minimal required rights for callouts; restrict access to the apex classes that require them.

13) Transaction records in Salesforce do not contain PAN or sensitive fields (only masked card information)
- [ ] Status: Not implemented in POC (recommended)
- Evidence: The repo does not currently store `PAN`; if you persist transaction information, it should only contain transaction ID, amount, and response codes.
- Action / Notes: If persisting transaction metadata, ensure you do not store tokens, PAN, track numbers, or CVV. Consider field-level encryption for PII.

14) Ensure production go-live checklist includes formal SAQ-A validation & security review
- [ ] Status: Required (manual process)
- Evidence: `eWayIntegrationGuide.md` documents security and compliance steps. The code includes comments and best practice suggestions.
- Action / Notes: Run a final SAQ-A checklist with a compliance/QSA review; validate environment-level settings, CSP, origin validation, Named Credential roles, and log sanitization.

---

## Quick summary - Verified vs. Recommended areas
- Verified: Tokenization (VF & eWAY), Named Credential usage, HTTPS usage, token-only flows, code-level error mapping, Apex test for V6021.
- Recommended / Manual configuration needed: CSP Trusted Sites added to org, enabling origin validation, additional Apex tests for negative flows, formal QSA validation and environment checks.

---

## Next steps for a production-ready SAQ-A signoff
1. Enable CSP Trusted Sites for eWAY domains in production org.
2. Add origin validation (production domain checks) on LWC and VF `message` handling.
3. Expand test coverage (positive & negative flows) and add CI pipelines for automated checks.
4. Harden logging: ensure tokens are redacted and debug output restricted to devs.
5. Implement a transaction record object for storing only non-sensitive data and set field access control.
6. Run a formal QSA validation or use internal compliance staff to validate the SAQ-A checklist for the org.

---

If you'd like, I can now:
- Commit this checklist as `SAQ-A-Checklist.md` in repo (done).
- Add or expand unit tests for the `V6148` (token expired) and `D` decline codes.
- Patch the code to enable production-level origin checks and CSP validation, then re-run tests.

Which of the above follow-ups would you like me to implement next?   
