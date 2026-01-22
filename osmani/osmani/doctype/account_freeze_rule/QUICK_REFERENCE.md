# Account Freeze Rule - Quick Reference

## ⚡ Quick Start

### Create a Freeze Rule

```
Accounting → Account Freeze Rule → New

Account: [Select Account]
Company: [Auto-filled]
From Date: YYYY-MM-DD
To Date: YYYY-MM-DD
Active: ✓
Reason: [Optional description]
```

### Common Use Cases

| Scenario | From Date | To Date | Active |
|----------|-----------|---------|--------|
| Lock December 2025 | 2025-12-01 | 2025-12-31 | ✓ |
| Lock Q4 2025 | 2025-10-01 | 2025-12-31 | ✓ |
| Lock Previous Year | 2025-01-01 | 2025-12-31 | ✓ |
| Temporary Hold | Today | +7 days | ✓ |

## 🎯 What It Does

✅ **Blocks all transactions** to frozen accounts during the period
✅ **Works across all doctypes** (JE, PE, SI, PI, Stock, etc.)
✅ **Account-specific** (doesn't freeze entire company)
✅ **Allows before/after** the freeze period
✅ **Multiple periods** per account (non-overlapping)

## 🚫 What Gets Blocked

When Account "14E01 - Expense" is frozen for Dec-2025:

| Date | Transaction | Result |
|------|-------------|--------|
| 2025-11-30 | Journal Entry | ✅ Allowed |
| 2025-12-01 | Payment Entry | ❌ Blocked |
| 2025-12-15 | Sales Invoice | ❌ Blocked |
| 2025-12-31 | Purchase Invoice | ❌ Blocked |
| 2026-01-01 | Journal Entry | ✅ Allowed |

## 📋 Error Message

```
Account Frozen

Cannot post to Account 14E01 - Office Expenses.
This account is frozen from 2025-12-01 to 2025-12-31.

Reason: December month closed for audit

Freeze Rule: ACC-FRZ-2025-00001
```

## 🔧 Common Operations

### Temporarily Unfreeze

1. Open the freeze rule
2. Uncheck **Active**
3. Save
4. Post your transaction
5. Re-check **Active**
6. Save

### Check if Account is Frozen

```javascript
// From browser console
frappe.call({
    method: "osmani.osmani.utils.account_freeze_validation.check_account_freeze_status",
    args: {
        account: "14E01 - Expense - OSM",
        company: "Osmani Ltd",
        posting_date: "2025-12-15"
    },
    callback: function(r) {
        console.log(r.message);
    }
});
```

### List Active Freezes

```sql
SELECT account, from_date, to_date, reason
FROM `tabAccount Freeze Rule`
WHERE active = 1
ORDER BY account;
```

## 🎨 UI Indicators

- 🟢 **Active**: Rule is enforcing the freeze
- ⚪ **Inactive**: Rule exists but not enforcing

## ⚠️ Important Rules

1. ✅ **Can have**: Multiple freeze periods for same account
2. ❌ **Cannot have**: Overlapping periods for same account
3. ✅ **Date range**: From Date must be ≤ To Date
4. ✅ **Account-Company**: Account must belong to the company
5. ✅ **Cancellation**: Can cancel transactions even if frozen

## 🚨 Emergency Procedures

### Need to Post Urgently?

**Option 1**: Deactivate rule temporarily
```
1. Deactivate the freeze rule
2. Post the transaction
3. Reactivate the freeze rule
4. Document in reason/comments
```

**Option 2**: System Manager bypass
```
Only System Manager can temporarily disable hooks
(Not recommended for audit compliance)
```

## 📊 Best Practices

### ✓ DO
- Add clear reasons for transparency
- Test on non-critical accounts first
- Use date ranges aligned with accounting periods
- Deactivate instead of delete (audit trail)
- Review freeze rules monthly

### ✗ DON'T
- Create overlapping rules (system prevents this)
- Delete rules (deactivate instead)
- Freeze without documentation
- Use without testing first
- Bypass without documenting

## 🔍 Troubleshooting

| Issue | Solution |
|-------|----------|
| Can still post to frozen account | Clear cache, restart bench |
| Error creating rule | Check for overlapping rules |
| Can't save rule | Verify dates and account-company match |
| Need to bypass | Temporarily deactivate rule |

## 📞 Quick Commands

```bash
# Migrate after installation
bench --site [site] migrate

# Restart to load hooks
bench restart

# Clear cache
bench --site [site] clear-cache

# Check logs
bench --site [site] logs

# Run tests
bench --site [site] run-tests --doctype "Account Freeze Rule"
```

## 🔐 Permissions

| Role | Access |
|------|--------|
| System Manager | Full |
| Accounts Manager | Create/Edit/Delete |
| Accounts User | View Only |

## 📈 Monitoring

### Current Active Freezes

```sql
SELECT 
    account,
    from_date,
    to_date,
    DATEDIFF(to_date, CURDATE()) as days_remaining
FROM `tabAccount Freeze Rule`
WHERE active = 1
AND CURDATE() BETWEEN from_date AND to_date;
```

### Upcoming Freeze Expirations

```sql
SELECT account, to_date
FROM `tabAccount Freeze Rule`
WHERE active = 1
AND to_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY);
```

## 💡 Pro Tips

1. **Monthly Close**: Create freeze rules after reconciliation
2. **Audit Season**: Freeze previous year at year-start
3. **Investigations**: Use temporary freezes during reviews
4. **Documentation**: Always add reason field
5. **Testing**: Test with test accounts first

## 📚 Files

- DocType: `account_freeze_rule.json`
- Controller: `account_freeze_rule.py`
- Validation: `utils/account_freeze_validation.py`
- Hooks: `hooks.py` (doc_events for GL Entry)
- Tests: `test_account_freeze_rule.py`

## 🌐 API Endpoints

```python
# Check freeze status
osmani.osmani.utils.account_freeze_validation.check_account_freeze_status(
    account, company, posting_date
)

# Get frozen accounts for date
osmani.osmani.utils.account_freeze_validation.get_frozen_accounts_for_date(
    company, posting_date
)
```

## ⏱️ Support Response Time

| Priority | Response Time |
|----------|---------------|
| System Down | Immediate |
| Cannot Post | 1-2 hours |
| Questions | 24 hours |
| Enhancements | As per roadmap |

---

**Version**: 1.0  
**Last Updated**: Jan 2026  
**Maintained By**: Osmani Development Team
