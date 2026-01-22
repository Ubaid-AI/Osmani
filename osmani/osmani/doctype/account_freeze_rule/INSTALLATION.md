# Account Freeze Rule - Installation & Setup Guide

## Installation Steps

### 1. Migrate Database

After the code is deployed, run migration to create the new DocType:

```bash
cd /home/frappe/frappe-bench
bench --site [your-site-name] migrate
```

### 2. Restart Services

Restart bench to load the new hooks:

```bash
bench restart
```

For production with supervisor:

```bash
sudo supervisorctl restart all
```

### 3. Clear Cache

Clear cache to ensure hooks are loaded:

```bash
bench --site [your-site-name] clear-cache
```

Or from Desk:
- Go to **Settings** → **System Settings**
- Click **Clear Cache**

### 4. Verify Installation

Check if the DocType is created:

```bash
bench --site [your-site-name] console
```

Then in the console:

```python
import frappe
frappe.get_meta("Account Freeze Rule")
# Should show the DocType meta without errors
```

## Configuration

### 1. Set Permissions

Go to **Setup** → **Permissions** → **Account Freeze Rule**

Recommended permissions:

| Role | Create | Read | Write | Delete | Report |
|------|--------|------|-------|--------|--------|
| System Manager | ✓ | ✓ | ✓ | ✓ | ✓ |
| Accounts Manager | ✓ | ✓ | ✓ | ✓ | ✓ |
| Accounts User | | ✓ | | | ✓ |

To set permissions via code:

```bash
bench --site [your-site-name] console
```

```python
import frappe

# Add permissions for Accounts Manager
frappe.get_doc({
    "doctype": "Custom DocPerm",
    "parent": "Account Freeze Rule",
    "parenttype": "DocType",
    "parentfield": "permissions",
    "role": "Accounts Manager",
    "permlevel": 0,
    "read": 1,
    "write": 1,
    "create": 1,
    "delete": 1,
    "submit": 0,
    "cancel": 0,
    "amend": 0,
    "report": 1,
    "export": 1,
    "print": 1,
    "email": 1,
    "share": 1
}).insert(ignore_permissions=True)

frappe.db.commit()
```

### 2. Add to Module

The DocType is already in the **Osmani** module. To make it more accessible:

1. Go to **Setup** → **Customize**
2. Search for **Account Freeze Rule**
3. Verify "Show in Module Section" is checked

### 3. Create Test Freeze Rule

Create your first freeze rule to test:

1. Go to **Accounting** → **Account Freeze Rule** → **New**
2. Fill in:
   - **Account**: Select any expense account
   - **Company**: Select your company
   - **From Date**: First day of last month
   - **To Date**: Last day of last month
   - **Active**: Checked
   - **Reason**: "Testing freeze functionality"
3. Click **Save**

### 4. Test the Freeze

Try to create a Journal Entry with:
- Posting date within the frozen period
- Using the frozen account

Expected result: Error message "Account is frozen for this period"

## Verification Checklist

- [ ] DocType created successfully
- [ ] Permissions configured
- [ ] Test freeze rule created
- [ ] Freeze validation working (error shown when posting)
- [ ] Can post before freeze period
- [ ] Can post after freeze period
- [ ] Cannot post during freeze period
- [ ] Can deactivate freeze rule
- [ ] Can create multiple non-overlapping rules

## Troubleshooting

### Hooks Not Working

**Symptom**: Can still post to frozen accounts

**Solution**:

1. Check if hooks are loaded:

```bash
bench --site [your-site-name] console
```

```python
import frappe
hooks = frappe.get_hooks()
print(hooks.get("doc_events"))
```

Should show:
```python
{
    'GL Entry': {
        'validate': ['osmani.osmani.utils.account_freeze_validation.validate_frozen_account']
    }
}
```

2. If not showing, reload hooks:

```bash
bench --site [your-site-name] migrate
bench restart
bench --site [your-site-name] clear-cache
```

### Import Errors

**Symptom**: Error "Module not found" or "Import error"

**Solution**:

1. Verify file exists:

```bash
ls -la /home/frappe/frappe-bench/apps/osmani/osmani/osmani/utils/account_freeze_validation.py
```

2. Check Python path:

```bash
bench --site [your-site-name] console
```

```python
import sys
print('\n'.join(sys.path))
```

3. Reinstall app:

```bash
bench --site [your-site-name] reinstall-app osmani
# Warning: This will delete all Osmani data!
```

Or safer approach:

```bash
bench --site [your-site-name] migrate
bench build --app osmani
bench restart
```

### Validation Not Showing Proper Error

**Symptom**: Generic error instead of freeze message

**Solution**: Check error logs:

```bash
bench --site [your-site-name] logs
```

Or in browser console (F12), check Network tab for error details.

### Permission Issues

**Symptom**: Cannot create freeze rules

**Solution**:

1. Add yourself to appropriate role:

```bash
bench --site [your-site-name] console
```

```python
import frappe
user = frappe.get_doc("User", "your.email@example.com")
user.append("roles", {"role": "Accounts Manager"})
user.save()
frappe.db.commit()
```

2. Or use UI:
   - **Setup** → **User** → [Your User]
   - Add role: **Accounts Manager**

## Testing

### Run Unit Tests

```bash
bench --site [your-site-name] run-tests --app osmani --doctype "Account Freeze Rule"
```

### Manual Testing Scenarios

#### Scenario 1: Basic Freeze

1. Create freeze rule for Account X, Dec 2025
2. Try to post Journal Entry dated 15-Dec-2025 with Account X
3. Expected: Error "Account is frozen"
4. Try to post Journal Entry dated 15-Nov-2025 with Account X
5. Expected: Success
6. Try to post Journal Entry dated 15-Jan-2026 with Account X
7. Expected: Success

#### Scenario 2: Multiple Doctypes

Test with different transaction types:
- Journal Entry
- Payment Entry
- Sales Invoice
- Purchase Invoice
- Stock Entry (if affects GL)

All should respect the freeze rule.

#### Scenario 3: Inactive Rule

1. Create freeze rule, set Active = No
2. Try to post to frozen account during period
3. Expected: Success (rule is inactive)

#### Scenario 4: Overlapping Prevention

1. Create freeze rule for Account X, 1-Dec to 31-Dec
2. Try to create another rule for Account X, 15-Dec to 15-Jan
3. Expected: Error about overlapping rules

## Performance Considerations

### Database Indexing

For better performance with many freeze rules, add indexes:

```sql
ALTER TABLE `tabAccount Freeze Rule` 
ADD INDEX idx_account_active (account, active);

ALTER TABLE `tabAccount Freeze Rule` 
ADD INDEX idx_account_company_dates (account, company, from_date, to_date, active);
```

### Caching (Optional)

For very high-volume systems, consider caching freeze rules:

```python
# In account_freeze_validation.py
from frappe.utils.redis_wrapper import RedisWrapper

@frappe.whitelist()
def get_cached_freeze_status(account, company, posting_date):
    cache_key = f"freeze_rule:{account}:{company}:{posting_date}"
    cache = frappe.cache()
    
    result = cache.get(cache_key)
    if result:
        return result
    
    result = check_account_freeze_status(account, company, posting_date)
    cache.setex(cache_key, 3600, result)  # Cache for 1 hour
    return result
```

## Monitoring

### Query to Check Active Freezes

```sql
SELECT 
    name, 
    account, 
    company, 
    from_date, 
    to_date, 
    reason
FROM `tabAccount Freeze Rule`
WHERE active = 1
AND CURDATE() BETWEEN from_date AND to_date
ORDER BY company, account;
```

### Report: Frozen Accounts

Create a custom report to view currently frozen accounts:

1. **Report Builder** → **New Report**
2. **Reference DocType**: Account Freeze Rule
3. **Filters**: Active = 1
4. **Fields**: Account, Company, From Date, To Date, Reason

## Maintenance

### Regular Tasks

1. **Review Freeze Rules**: Monthly review of active rules
2. **Archive Old Rules**: Deactivate rules for old periods
3. **Audit Log**: Check who created/modified freeze rules
4. **Performance**: Monitor query performance on GL Entry

### Backup Before Changes

Before modifying freeze rules:

```bash
bench --site [your-site-name] backup
```

## Support

### Get Help

1. **Check Logs**:
   ```bash
   bench --site [your-site-name] logs
   tail -f /home/frappe/frappe-bench/logs/[site-name].log
   ```

2. **Console Debugging**:
   ```bash
   bench --site [your-site-name] console
   ```
   
   ```python
   import frappe
   from osmani.osmani.utils.account_freeze_validation import check_account_freeze_status
   
   # Test a specific scenario
   result = check_account_freeze_status(
       "5000 - Salaries - OSM",
       "Osmani Ltd",
       "2025-12-15"
   )
   print(result)
   ```

3. **Community Support**:
   - ERPNext Forum: https://discuss.erpnext.com
   - Frappe Forum: https://discuss.frappe.io

## Uninstallation (If Needed)

To remove the feature:

1. Deactivate all freeze rules
2. Remove hook from `hooks.py`:
   ```python
   # Comment out or remove:
   # doc_events = {
   #     "GL Entry": {
   #         "validate": "osmani.osmani.utils.account_freeze_validation.validate_frozen_account"
   #     }
   # }
   ```
3. Restart:
   ```bash
   bench restart
   bench --site [your-site-name] clear-cache
   ```
4. Optionally delete DocType:
   ```bash
   bench --site [your-site-name] console
   ```
   ```python
   import frappe
   frappe.delete_doc("DocType", "Account Freeze Rule", force=1)
   frappe.db.commit()
   ```

## Conclusion

The Account Freeze Rule is now installed and ready to use. Start with test accounts and gradually roll out to production accounts once verified.

For questions or issues, refer to the README.md file or contact your system administrator.
