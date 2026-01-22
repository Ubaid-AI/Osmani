# Account Freeze Rule

## Overview

The Account Freeze Rule feature allows you to freeze specific GL accounts for specific date ranges, preventing any accounting entries from being posted to those accounts during the frozen period.

## Key Features

- **Account-Specific**: Freeze individual accounts, not the entire company
- **Date-Range Based**: Define exact periods (monthly, quarterly, or custom)
- **Multiple Periods**: Same account can have multiple non-overlapping freeze periods
- **Global Enforcement**: Works across all doctypes (Journal Entry, Payment Entry, Sales Invoice, Purchase Invoice, Stock transactions, etc.)
- **Server-Side Validation**: Non-bypassable, enforced at GL Entry level
- **Upgrade-Safe**: Uses Frappe hooks, no core ERPNext modifications

## How It Works

### Validation Flow

```
Any DocType Transaction
    ↓
Creates GL Entries
    ↓
GL Entry.validate() hook triggered
    ↓
Check Account Freeze Rule
    ↓
If frozen → Throw Error
If not frozen → Allow posting
```

### Use Cases

1. **Month-End Closing**: Freeze accounts after month-end reconciliation
2. **Audit Compliance**: Lock accounts during audit periods
3. **Year-End Closing**: Freeze previous fiscal year accounts
4. **Temporary Holds**: Block specific accounts during investigations

## Configuration

### Fields

- **Account** (Required): The GL account to freeze
- **Company** (Required): Company to which the account belongs
- **From Date** (Required): Start date of freeze period
- **To Date** (Required): End date of freeze period
- **Active** (Default: Yes): Enable/disable the freeze rule
- **Reason**: Optional description for the freeze

### Creating a Freeze Rule

1. Go to **Account Freeze Rule** list
2. Click **New**
3. Select the **Account** (company auto-fills)
4. Set **From Date** and **To Date**
5. Add optional **Reason**
6. Ensure **Active** is checked
7. Save

### Example

```
Account: 14E01 - Office Expenses - OSM
Company: Osmani Ltd
From Date: 2025-12-01
To Date: 2025-12-31
Active: ✓
Reason: December month closed for audit
```

**Result**: 
- ✅ Can post entries dated before 2025-12-01
- ❌ Cannot post entries dated between 2025-12-01 and 2025-12-31
- ✅ Can post entries dated after 2025-12-31

## Technical Implementation

### Components

1. **DocType**: `Account Freeze Rule`
   - Stores freeze configurations
   - Validates date ranges and overlaps

2. **Validation Module**: `osmani.osmani.utils.account_freeze_validation`
   - `validate_frozen_account()`: Main validation function
   - `check_account_freeze_status()`: Whitelisted API for checking status
   - `get_frozen_accounts_for_date()`: Utility for reports

3. **Hook**: GL Entry validation
   ```python
   doc_events = {
       "GL Entry": {
           "validate": "osmani.osmani.utils.account_freeze_validation.validate_frozen_account"
       }
   }
   ```

### Validation Logic

```python
def validate_frozen_account(doc, method=None):
    # Check if account is frozen for posting date
    freeze_rules = frappe.get_all(
        "Account Freeze Rule",
        filters={
            "account": doc.account,
            "company": doc.company,
            "active": 1,
            "from_date": ["<=", posting_date],
            "to_date": [">=", posting_date]
        }
    )
    
    if freeze_rules:
        frappe.throw("Account is frozen for this period")
```

## Error Messages

When attempting to post to a frozen account:

```
Account Frozen

Cannot post to Account 14E01 - Office Expenses. 
This account is frozen from 2025-12-01 to 2025-12-31.

Reason: December month closed for audit

Freeze Rule: ACC-FRZ-2025-00001
```

## Best Practices

1. **Test First**: Test freeze rules on non-critical accounts first
2. **Document Reasons**: Always add a reason for transparency
3. **Non-Overlapping**: System prevents overlapping rules automatically
4. **Deactivate vs Delete**: Deactivate rules instead of deleting for audit trail
5. **Role Permissions**: Restrict creation to Accounts Managers only

## Permissions

Default permissions (can be customized):
- **System Manager**: Full access
- **Accounts Manager**: Create, read, write, delete (recommended)
- **Accounts User**: Read only (recommended)

## API Usage

### Check Account Status (JavaScript)

```javascript
frappe.call({
    method: "osmani.osmani.utils.account_freeze_validation.check_account_freeze_status",
    args: {
        account: "14E01 - Office Expenses - OSM",
        company: "Osmani Ltd",
        posting_date: "2025-12-15"
    },
    callback: function(r) {
        if (r.message.is_frozen) {
            console.log("Account is frozen:", r.message.freeze_rule);
        }
    }
});
```

### Get Frozen Accounts (Python)

```python
from osmani.osmani.utils.account_freeze_validation import get_frozen_accounts_for_date

frozen_accounts = get_frozen_accounts_for_date("Osmani Ltd", "2025-12-15")
for account in frozen_accounts:
    print(f"{account.account}: {account.from_date} to {account.to_date}")
```

## Troubleshooting

### Issue: Validation not working

**Solution**: Ensure hooks are loaded
```bash
cd /home/frappe/frappe-bench
bench --site [your-site] migrate
bench restart
```

### Issue: Can't save freeze rule (overlap error)

**Solution**: Check for existing active rules for the same account and date range. Deactivate or modify conflicting rules.

### Issue: Need to post to frozen account (emergency)

**Solution**: 
1. Temporarily deactivate the freeze rule
2. Post the entry
3. Reactivate the freeze rule
4. Document the exception for audit purposes

## Future Enhancements

Potential improvements:
- Role-based bypass permissions
- Scheduled auto-activation (e.g., auto-freeze after 7 days)
- Bulk freeze creation (multiple accounts at once)
- Integration with Period Closing system
- Notification on freeze activation

## Support

For issues or questions:
- Check Frappe/ERPNext logs: `bench --site [site] logs`
- Review error logs in desk
- Contact system administrator

## License

MIT License - Same as parent app
