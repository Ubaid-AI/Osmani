import frappe
import requests
from frappe.email.doctype.email_queue.email_queue import EmailQueue

class CustomEmailQueue(EmailQueue):
    def after_insert(self):
        # This will be triggered after the EmailQueue record is created
        self.trigger_custom_api()

    def trigger_custom_api(self):
        # Prepare the payload to send to your external API
        payload = {
            "sid": "a7f074b98b8675534d061638bb533f7e6e7e4e1cd261866125b47a35",  # your sid value
            "recipients": [r.recipient for r in self.recipients],  # Recipients from the EmailQueue
            # "subject": self.subject or "",  # Subject from the EmailQueue
            "message": self.message,  # Message body from the EmailQueue
            "sender": self.sender,  # Sender from the EmailQueue
            "message_id": self.message_id,  # Message ID from the EmailQueue
            "reference_doctype": self.reference_doctype,  # Reference Doctype from the EmailQueue
            "reference_name": self.reference_name,  # Reference Name from the EmailQueue
            "communication": self.communication,  # Communication ID from the EmailQueue
            "priority": self.priority,  # Priority from the EmailQueue
            "email_account": self.email_account,  # Email Account from the EmailQueue
            "unsubscribe_method": self.unsubscribe_method,  # Unsubscribe Method from the EmailQueue
            "expose_recipients": self.expose_recipients,  # Expose Recipients from the EmailQueue
        }

        try:
            # Send the data to the external API
            response = requests.post(
                "http://208.209.1.44:8089/api/method/osmani.create_email_queue.create_email_queue",
                json=payload,
                timeout=10
            )
            response.raise_for_status()  # Raise an exception for HTTP errors
            # Log success response for debugging
            frappe.log_error(f"API Response: {response.status_code} - {response.text}", "CustomEmailQueue")
        except requests.exceptions.RequestException as e:
            # Log the error if the API request fails
            frappe.log_error(f"Error sending email to external API: {e}", "CustomEmailQueue")
