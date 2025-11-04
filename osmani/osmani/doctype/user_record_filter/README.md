# User Record Filter System

A dynamic user restriction system for Frappe Framework that allows administrators to configure record visibility filters through a dedicated DocType.

## Overview

The User Record Filter system enables administrators to create custom filters that automatically restrict which records users can see when accessing specific DocTypes. This is particularly useful for multi-tenant applications or when you need to implement complex data visibility rules.

## Features

- **Dynamic Field Selection**: Automatically populates available fields based on selected DocType
- **Multiple Restriction Types**: Supports various operators (equals, not equals, in, not in, like, etc.)
- **Special Values**: Built-in support for session-based values like `session_user`
- **Performance Optimized**: Uses caching and efficient SQL query conditions
- **Easy Integration**: Simple hooks-based integration with existing DocTypes

## DocTypes

### User Record Filter
Main DocType for configuring user-specific filters.

**Fields:**
- `user`: Link to User - The user for whom the filter applies
- `active`: Check - Whether the filter is active
- `description`: Small Text - Optional description of the filter
- `filter_details`: Table - Child table containing filter configurations

### User Record Filter Detail
Child table containing the actual filter configurations.

**Fields:**
- `doctype_name`: Link to DocType - The target DocType to filter
- `field_name`: Select - The field to apply the filter on (dynamically populated)
- `restriction_type`: Select - The type of restriction/operator
- `filter_value`: Data - The value to filter by
- `active`: Check - Whether this specific filter detail is active

## Restriction Types

| Type | Description | Example |
|------|-------------|---------|
| `equals` | Exact match | `owner equals session_user` |
| `not_equals` | Not equal to | `status not_equals Cancelled` |
| `in` | Value in list | `status in Draft,Submitted` |
| `not_in` | Value not in list | `status not_in Cancelled,Rejected` |
| `like` | Text contains | `customer_name like John` |
| `not_like` | Text does not contain | `remarks not_like test` |
| `greater_than` | Numeric/Date comparison | `grand_total greater_than 1000` |
| `less_than` | Numeric/Date comparison | `posting_date less_than 2024-01-01` |
| `greater_than_equal` | Numeric/Date comparison | `qty greater_than_equal 10` |
| `less_than_equal` | Numeric/Date comparison | `rate less_than_equal 100` |
| `is_set` | Field has any value | `customer is_set` |
| `is_not_set` | Field is empty/null | `remarks is_not_set` |

## Special Values

- `session_user`: Automatically replaced with the current user's ID
- `session_user_roles`: Automatically replaced with current user's roles (comma-separated)

## Usage Examples

### Example 1: Restrict Purchase Invoices to Owner
```
DocType: Purchase Invoice
Field: owner
Restriction Type: equals
Value: session_user
Active: ✓
```

### Example 2: Show Only Draft Sales Orders
```
DocType: Sales Order
Field: status
Restriction Type: equals
Value: Draft
Active: ✓
```

### Example 3: Hide Cancelled Documents
```
DocType: Sales Invoice
Field: docstatus
Restriction Type: not_equals
Value: 2
Active: ✓
```

### Example 4: Territory-based Filtering
```
DocType: Customer
Field: territory
Restriction Type: in
Value: North Zone,East Zone
Active: ✓
```

## Installation and Setup

### 1. Install the DocTypes

The DocTypes are automatically installed when you install the Osmani app. If you need to install them manually:

```bash
cd /path/to/frappe-bench
bench --site your-site migrate
```

### 2. Configure Permissions

Ensure that users who need to create/manage filters have appropriate permissions:

- **System Manager**: Full access to User Record Filter
- **Administrator**: Full access to User Record Filter
- **Custom Role**: Create a custom role with read/write access as needed

### 3. Integrate with Target DocTypes

#### Method 1: Using Hooks (Recommended)

Add to your app's `hooks.py`:

```python
permission_query_conditions = {
    "Sales Order": "osmani.osmani.doctype.sales_order_filter.sales_order_filter.get_permission_query_conditions_sales_order",
    "Purchase Invoice": "osmani.osmani.doctype.purchase_invoice_filter.purchase_invoice_filter.get_permission_query_conditions_purchase_invoice",
}
```

#### Method 2: Direct Integration

Add to your DocType's Python class:

```python
from osmani.osmani.doctype.user_record_filter.user_record_filter import get_permission_query_conditions

class YourDocType(Document):
    @staticmethod
    def get_permission_query_conditions(user=None):
        return get_permission_query_conditions("Your DocType", user)
```

#### Method 3: Using Utility Functions

```python
from osmani.osmani.utils.user_filter_integration import register_doctype_filter

# Register a DocType for filtering
register_doctype_filter("Your DocType")
```

### 4. Restart the Application

After making changes to hooks or DocType classes:

```bash
bench restart
```

## API Reference

### Server-side Functions

#### `get_user_filters(user=None)`
Get active filters for a user.

```python
from osmani.osmani.doctype.user_record_filter.user_record_filter import get_user_filters

filters = get_user_filters("user@example.com")
```

#### `get_permission_query_conditions(doctype, user=None)`
Get SQL conditions for a DocType based on user filters.

```python
from osmani.osmani.doctype.user_record_filter.user_record_filter import get_permission_query_conditions

conditions = get_permission_query_conditions("Sales Order", "user@example.com")
```

#### `get_doctype_fields(doctype)`
Get available fields for a DocType (used by client-side).

```python
from osmani.osmani.doctype.user_record_filter.user_record_filter import get_doctype_fields

fields = get_doctype_fields("Sales Order")
```

### Client-side Functions

The JavaScript automatically handles:
- Dynamic field population when DocType is selected
- Restriction type options based on field type
- Value field behavior based on restriction type
- Form validation and user experience

## Performance Considerations

### Caching
- User filters are cached for 5 minutes to improve performance
- Cache is automatically cleared when filters are updated
- Use the "Clear Cache" button in the form for manual cache clearing

### Query Optimization
- Filters are applied at the SQL level for optimal performance
- Multiple filters for the same user are combined with AND conditions
- Indexes should be created on frequently filtered fields

### Production Deployment
- Always use `bench restart` instead of `bench start` when deploying changes
- Monitor query performance with multiple active filters
- Consider database indexing for filtered fields

## Security Considerations

### Permission Validation
- Users can only create filters for themselves unless they have System Manager role
- DocType access is validated before applying filters
- SQL injection protection through proper escaping

### Best Practices
- Regularly audit active filters
- Use specific field-based filters rather than broad restrictions
- Test filters thoroughly before deploying to production
- Monitor system performance with active filters

## Troubleshooting

### Common Issues

1. **Filters not applying**
   - Check if the filter is active
   - Verify the DocType integration is properly configured
   - Clear the user filter cache
   - Check server logs for errors

2. **Performance issues**
   - Review the number of active filters
   - Check if filtered fields have proper indexes
   - Monitor SQL query execution time

3. **Field options not loading**
   - Verify the DocType exists and is accessible
   - Check browser console for JavaScript errors
   - Ensure proper permissions on the target DocType

### Debug Mode

Enable debug mode to see generated SQL conditions:

```python
# In your DocType's get_permission_query_conditions method
conditions = get_permission_query_conditions("Your DocType", user)
frappe.logger().debug(f"User filter conditions for {user}: {conditions}")
```

### Testing Filters

Use the built-in test function:

```python
from osmani.osmani.utils.user_filter_integration import test_doctype_filter

result = test_doctype_filter("Sales Order", "user@example.com")
print(result)
```

## Advanced Usage

### Custom Restriction Types

You can extend the system by adding custom restriction types in the `build_condition` function:

```python
def build_condition(detail):
    # ... existing code ...
    elif restriction_type == "custom_type":
        return f"custom_sql_condition_here"
```

### Integration with Custom Apps

Create your own integration module:

```python
# your_app/user_filter_integration.py
from osmani.osmani.doctype.user_record_filter.user_record_filter import get_permission_query_conditions

def get_permission_query_conditions_your_doctype(user=None):
    return get_permission_query_conditions("Your DocType", user)
```

### Bulk Filter Management

Create filters programmatically:

```python
def create_bulk_filters():
    for user in frappe.get_all("User", filters={"enabled": 1}):
        filter_doc = frappe.new_doc("User Record Filter")
        filter_doc.user = user.name
        filter_doc.active = 1
        filter_doc.append("filter_details", {
            "doctype_name": "Sales Order",
            "field_name": "owner",
            "restriction_type": "equals",
            "filter_value": "session_user",
            "active": 1
        })
        filter_doc.save()
```

## Support and Contributing

For issues, feature requests, or contributions, please contact the development team or create an issue in the project repository.

## License

This module is licensed under the MIT License. See the license file for details.