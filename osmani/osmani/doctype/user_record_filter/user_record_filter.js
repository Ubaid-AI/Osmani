// Copyright (c) 2024, Ubaid Ali and contributors
// For license information, please see license.txt

frappe.ui.form.on('User Record Filter', {
	refresh: function(frm) {
		// Add custom buttons
		if (!frm.doc.__islocal) {
			frm.add_custom_button(__('Test Filters'), function() {
				test_user_filters(frm);
			});
			
			frm.add_custom_button(__('Clear Cache'), function() {
				clear_user_filter_cache(frm);
			});
		}
		
		// Set user default to current user if new document
		if (frm.doc.__islocal && !frm.doc.user) {
			frm.set_value('user', frappe.session.user);
		}
	},
	
	user: function(frm) {
		// Validate user selection
		if (frm.doc.user && frm.doc.user !== frappe.session.user) {
			frappe.call({
				method: 'frappe.client.get_value',
				args: {
					doctype: 'User',
					fieldname: 'enabled',
					filters: {name: frm.doc.user}
				},
				callback: function(r) {
					if (r.message && !r.message.enabled) {
						frappe.msgprint(__('Selected user is disabled'));
					}
				}
			});
		}
	}
});

frappe.ui.form.on('User Record Filter Detail', {
	doctype_name: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.doctype_name) {
			// Clear field selection when DocType changes
			frappe.model.set_value(cdt, cdn, 'field_name', '');
			frappe.model.set_value(cdt, cdn, 'filter_value', '');
			
			// Populate field options
			populate_field_options(frm, cdt, cdn, row.doctype_name);
		}
	},
	
	field_name: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.field_name) {
			// Clear value when field changes
			frappe.model.set_value(cdt, cdn, 'filter_value', '');
			
			// Set appropriate restriction types based on field type
			set_restriction_type_options(frm, cdt, cdn, row.field_name, row.doctype_name);
		}
	},
	
	restriction_type: function(frm, cdt, cdn) {
		let row = locals[cdt][cdn];
		if (row.restriction_type) {
			// Clear value when restriction type changes
			frappe.model.set_value(cdt, cdn, 'filter_value', '');
			
			// Set field behavior based on restriction type
			set_value_field_behavior(frm, cdt, cdn, row.restriction_type, row.field_name, row.doctype_name);
		}
	},
	
	filter_details_add: function(frm, cdt, cdn) {
		// Set default active state for new rows
		frappe.model.set_value(cdt, cdn, 'active', 1);
	}
});

function populate_field_options(frm, cdt, cdn, doctype_name) {
	frappe.call({
		method: 'osmani.osmani.doctype.user_record_filter.user_record_filter.get_doctype_fields',
		args: {
			doctype: doctype_name
		},
		callback: function(r) {
			if (r.message) {
				let field_options = r.message.map(field => field.value).join('\n');
				
				// Update field options
				let field = frappe.meta.get_docfield('User Record Filter Detail', 'field_name', cdn);
				field.options = field_options;
				
				// Refresh the field
				frm.fields_dict.filter_details.grid.update_docfield_property(
					'field_name', 'options', field_options
				);
				
				// Store field metadata for later use
				frm._field_metadata = frm._field_metadata || {};
				frm._field_metadata[doctype_name] = r.message;
			}
		}
	});
}

function set_restriction_type_options(frm, cdt, cdn, field_name, doctype_name) {
	if (!frm._field_metadata || !frm._field_metadata[doctype_name]) {
		return;
	}
	
	let field_meta = frm._field_metadata[doctype_name].find(f => f.value === field_name);
	if (!field_meta) {
		return;
	}
	
	let restriction_options = [];
	
	// Basic options for all field types
	restriction_options.push('equals', 'not_equals', 'is_set', 'is_not_set');
	
	// Additional options based on field type
	if (['Data', 'Text', 'Small Text', 'Long Text'].includes(field_meta.fieldtype)) {
		restriction_options.push('like', 'not_like', 'in', 'not_in');
	} else if (['Int', 'Float', 'Currency', 'Percent'].includes(field_meta.fieldtype)) {
		restriction_options.push('greater_than', 'less_than', 'greater_than_equal', 'less_than_equal', 'in', 'not_in');
	} else if (['Date', 'Datetime', 'Time'].includes(field_meta.fieldtype)) {
		restriction_options.push('greater_than', 'less_than', 'greater_than_equal', 'less_than_equal');
	} else if (['Link', 'Select'].includes(field_meta.fieldtype)) {
		restriction_options.push('in', 'not_in');
	}
	
	// Update restriction type options
	let restriction_field = frappe.meta.get_docfield('User Record Filter Detail', 'restriction_type', cdn);
	restriction_field.options = restriction_options.join('\n');
	
	frm.fields_dict.filter_details.grid.update_docfield_property(
		'restriction_type', 'options', restriction_options.join('\n')
	);
}

function set_value_field_behavior(frm, cdt, cdn, restriction_type, field_name, doctype_name) {
	let row = locals[cdt][cdn];
	
	// Set placeholder text based on restriction type
	let placeholder = '';
	let description = '';
	
	switch (restriction_type) {
		case 'equals':
		case 'not_equals':
			placeholder = 'Enter single value or use session_user for current user';
			description = 'Use "session_user" for current user';
			break;
		case 'in':
		case 'not_in':
			placeholder = 'Enter comma-separated values (e.g., value1, value2, value3)';
			description = 'Multiple values separated by commas';
			break;
		case 'like':
		case 'not_like':
			placeholder = 'Enter text to search (wildcards will be added automatically)';
			description = 'Text search with automatic wildcards';
			break;
		case 'greater_than':
		case 'less_than':
		case 'greater_than_equal':
		case 'less_than_equal':
			placeholder = 'Enter numeric or date value';
			description = 'Numeric or date comparison';
			break;
		case 'is_set':
		case 'is_not_set':
			placeholder = 'No value needed';
			description = 'Checks if field has any value';
			// Disable value field for these types
			frappe.model.set_value(cdt, cdn, 'filter_value', '');
			break;
	}
	
	// Update field properties
	let value_field = frappe.meta.get_docfield('User Record Filter Detail', 'filter_value', cdn);
	if (value_field) {
		value_field.placeholder = placeholder;
		value_field.description = description;
		value_field.reqd = !['is_set', 'is_not_set'].includes(restriction_type);
	}
}

function test_user_filters(frm) {
	frappe.call({
		method: 'osmani.osmani.doctype.user_record_filter.user_record_filter.get_user_filters',
		args: {
			user: frm.doc.user
		},
		callback: function(r) {
			if (r.message) {
				let message = '<h4>Active Filters for ' + frm.doc.user + ':</h4>';
				
				r.message.forEach(function(filter) {
					message += '<h5>' + filter.name + '</h5>';
					if (filter.details && filter.details.length > 0) {
						message += '<ul>';
						filter.details.forEach(function(detail) {
							message += '<li><strong>' + detail.doctype_name + '</strong>: ' + 
								detail.field_name + ' ' + detail.restriction_type + ' "' + 
								(detail.filter_value || 'N/A') + '"</li>';
						});
						message += '</ul>';
					} else {
						message += '<p>No active filter details</p>';
					}
				});
				
				frappe.msgprint({
					title: __('User Filter Test'),
					message: message,
					indicator: 'blue'
				});
			}
		}
	});
}

function clear_user_filter_cache(frm) {
	frappe.call({
		method: 'frappe.cache.delete_value',
		args: {
			key: 'user_record_filters_' + frm.doc.user
		},
		callback: function(r) {
			frappe.show_alert({
				message: __('Cache cleared for user {0}', [frm.doc.user]),
				indicator: 'green'
			});
		}
	});
}