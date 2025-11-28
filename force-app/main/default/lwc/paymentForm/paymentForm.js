/**
 * @description LWC Payment Form for eWAY Secure Fields Integration
 * @author jamesperram@gmail.com
 * Handles SAQ A compliant payment processing via VF iframe wrapper
 */
import { LightningElement, api, track } from 'lwc';
import processPayment from '@salesforce/apex/eWayPaymentController.processPayment';

export default class PaymentForm extends LightningElement {
    // eWAY Sandbox Public API Key
    publicApiKey = 'epk-3C093D46-0E5E-4D01-AD07-53487A0CA041';
    
    @api recordId; // Provided when placed on record pages like Account
    
    @track amount = 10; // Default $10.00 (in dollars)
    @track firstName = '';
    @track lastName = '';
    @track email = '';
    
    @track isProcessing = false;
    @track fieldsReady = false;
    @track statusMessage = '';
    @track errorMessage = '';
    @track successMessage = '';
    @track debugMode = false; // Toggle to show raw response
    @track debugResponse = '';
    
    iframeWindow = null;
    securedCardToken = null;
    isModalOpen = false;
    _iframeSrcSet = false;

    // Lifecycle: Set up message listener
    connectedCallback() {
        window.addEventListener('message', this.handleIframeMessage.bind(this));
    }

    disconnectedCallback() {
        window.removeEventListener('message', this.handleIframeMessage.bind(this));
    }

    renderedCallback() {
        // Ensure we set iframe src once (avoid binding in template to remove LWC1034 error)
        if (this.isModalOpen && !this._iframeSrcSet) {
            const iframe = this.template.querySelector('iframe[data-id="secureIframe"]');
            if (iframe) {
                iframe.src = this.iframeSrc;
                this._iframeSrcSet = true;
            }
        }
    }

    // Handle iframe load
    handleIframeLoad(event) {
        console.log('Iframe loaded');
        this.iframeWindow = event.target.contentWindow;
        this.statusMessage = 'Loading secure payment fields...';
        
        // Wait a moment for iframe to be ready, then initialize
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {
            this.initializeEwayFields();
        }, 500);
    }

    // Initialize eWAY Secure Fields in the iframe
    initializeEwayFields() {
        if (!this.iframeWindow) {
            console.error('Iframe window not available');
            return;
        }
        
        console.log('Sending INIT_EWAY message to iframe');
        this.iframeWindow.postMessage({
            action: 'INIT_EWAY',
            publicApiKey: this.publicApiKey
        }, '*');
    }

    // Handle messages from the Visualforce iframe
    handleIframeMessage(event) {
        // SECURITY: In production, validate event.origin
        // const validOrigins = ['.force.com', '.visual.force.com'];
        // if (!validOrigins.some(origin => event.origin.includes(origin))) return;
        
        const data = event.data;
        if (!data || !data.action) return;
        
        console.log('Received message from iframe:', data);
        
        switch(data.action) {
            case 'VF_LOADED':
                console.log('Visualforce page loaded');
                break;
                
            case 'FIELDS_READY':
                this.fieldsReady = true;
                this.statusMessage = '';
                console.log('Payment fields are ready');
                break;
                
            case 'INIT_ERROR':
                this.errorMessage = data.error || 'Failed to initialize payment fields';
                this.statusMessage = '';
                break;
                
            case 'TOKEN_GENERATED':
                console.log('Token received from eWAY');
                this.securedCardToken = data.token;
                this.submitPayment();
                break;
                
            case 'TOKENIZE_ERROR':
            case 'ERROR':
                this.errorMessage = data.error || 'Card validation failed';
                this.isProcessing = false;
                this.statusMessage = '';
                break;
            default:
                break;
        }
    }

    // Input handlers
    handleAmountChange(event) {
        this.amount = parseFloat(event.target.value) || 0;
    }

    handleFirstNameChange(event) {
        this.firstName = event.target.value;
    }

    handleLastNameChange(event) {
        this.lastName = event.target.value;
    }

    handleEmailChange(event) {
        this.email = event.target.value;
    }

    // Validate customer info before processing
    validateCustomerInfo() {
        const errors = [];
        
        if (!this.firstName || this.firstName.trim() === '') {
            errors.push('First name is required');
        }
        if (!this.lastName || this.lastName.trim() === '') {
            errors.push('Last name is required');
        }
        if (!this.email || !this.isValidEmail(this.email)) {
            errors.push('Valid email is required');
        }
        if (!this.amount || this.amount <= 0) {
            errors.push('Valid amount is required');
        }
        
        return errors;
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Handle Pay button click
    handlePay() {
        // Clear previous messages
        this.errorMessage = '';
        this.successMessage = '';
        
        // Validate customer info
        const errors = this.validateCustomerInfo();
        if (errors.length > 0) {
            this.errorMessage = errors.join('. ');
            return;
        }
        
        if (!this.fieldsReady) {
            this.errorMessage = 'Payment fields are not ready. Please wait.';
            return;
        }
        
        // Start processing
        this.isProcessing = true;
        this.statusMessage = 'Validating card details...';
        
        // Request tokenization from the iframe
        if (this.iframeWindow) {
            this.iframeWindow.postMessage({
                action: 'TOKENIZE'
            }, '*');
        } else {
            this.errorMessage = 'Payment system not initialized';
            this.isProcessing = false;
            this.statusMessage = '';
        }
    }

    // Submit payment to Apex after receiving token
    submitPayment() {
        if (!this.securedCardToken) {
            this.errorMessage = 'Payment token missing';
            this.isProcessing = false;
            return;
        }
        
        this.statusMessage = 'Processing payment...';
        
        processPayment({
            securedCardData: this.securedCardToken,
            amountInCents: Math.round(this.amount * 100),
            firstName: this.firstName,
            lastName: this.lastName,
            email: this.email
        })
        .then(result => {
            let response;
            try {
                response = JSON.parse(result);
            } catch (e) {
                this.errorMessage = 'Unexpected response from payment gateway';
                console.error('Failed to parse Apex response:', result, e);
                return;
            }

            // Store raw response for debugging optionally
            this.debugResponse = response && response.rawResponse ? JSON.stringify(response.rawResponse) : JSON.stringify(response);

            if (response && response.success) {
                this.successMessage = `Payment successful! Transaction ID: ${response.transactionId}`;
                this.statusMessage = '';
                
                // Close modal after short delay to show success
                // eslint-disable-next-line @lwc/lwc/no-async-operation
                setTimeout(() => {
                    this.closeModal();
                }, 2000);
            } else {
                // Show returned message if present and include code
                const code = response && response.responseCode ? ` (${response.responseCode})` : '';
                this.errorMessage = (response && (response.responseMessage || response.message)) ? `${response.responseMessage || response.message}${code}` : 'Payment failed';
                // Log stringified response to avoid Proxy(Object) display
                try { console.warn('Payment failed response:', JSON.stringify(response)); } catch (e) { console.warn('Payment failed response (object)', response); }
            }
        })
        .catch(error => {
            // Better parsing of Apex/Aura errors
            console.error('Payment error:', error);
            // Try to extract a meaningful message
            let msg = 'Payment processing failed. Please try again.';
            if (error && typeof error === 'object') {
                if (error.body && error.body.message) {
                    msg = error.body.message;
                } else if (error.message) {
                    msg = error.message;
                } else {
                    msg = JSON.stringify(error);
                }
            }
            this.errorMessage = msg;
            // show raw error in debug response if present
            try { this.debugResponse = JSON.stringify(error.body || error); } catch (e) { this.debugResponse = '';} 
        })
        .finally(() => {
            this.isProcessing = false;
            this.statusMessage = '';
            this.securedCardToken = null;
        });
    }

    // Modal handlers
    openModal() {
        this.isModalOpen = true;
        this.fieldsReady = false;
        this._iframeSrcSet = false;
        // Clear any previous messages
        this.errorMessage = '';
        this.successMessage = '';
        this.statusMessage = '';
    }

    closeModal() {
        this.isModalOpen = false;
        this.iframeWindow = null;
        this.isProcessing = false;
        this.fieldsReady = false;
        this._iframeSrcSet = false;
        this.securedCardToken = null;
    }

    handleDebugToggle(event) {
        this.debugMode = event.target.checked;
    }

    // Provide dynamic iframe src that optionally includes the recordId for record pages
    get iframeSrc() {
        return this.recordId ? `/apex/eWaySecureFields?accountId=${this.recordId}` : '/apex/eWaySecureFields';
    }

    // Computed properties
    get isPayDisabled() {
        return this.isProcessing || !this.fieldsReady;
    }

    get displayAmount() {
        return parseFloat(this.amount || 0).toFixed(2);
    }

    get showStatus() {
        return this.statusMessage !== '';
    }

    get showError() {
        return this.errorMessage !== '';
    }

    get showSuccess() {
        return this.successMessage !== '';
    }
}
