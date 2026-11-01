# Edge Cases Test
# Tests for unusual but valid Rego syntax

package test.edge_cases

import future.keywords.if
import future.keywords.in
import future.keywords.every
import data.external.module as ext

# Rule with underscore name
_private_rule := true

# Rule starting with number-like pattern (after underscore)
_123_numeric_prefix := "valid"

# Very long string
long_string := "This is a very long string that might wrap across multiple lines in an editor but is still a single string literal in Rego"

# Raw string with special characters
raw_with_specials := `This has "quotes" and \backslashes\ and
newlines`

# Empty collections
empty_array := []
empty_object := {}
empty_set := set()

# Deeply nested structure
nested := {
    "level1": {
        "level2": {
            "level3": {
                "level4": {
                    "value": [1, 2, 3]
                }
            }
        }
    }
}

# Complex boolean expression
complex_bool if {
    (input.a == true)
    (input.b != false)
    not (input.c == null)
    input.d > 0
    input.e < 100
    input.f >= 10
    input.g <= 50
}

# Chained else
result := "first" if {
    input.value == 1
} else := "second" if {
    input.value == 2
} else := "third" if {
    input.value == 3
} else := "fourth" if {
    input.value == 4
} else := "default"

# Multiple some bindings
multi_some if {
    some i, v in input.array
    some k, val in input.object
    v == val
}

# Negation patterns
not_in_list if {
    not input.item in input.blocked_items
}

# `not not x` is a parse error in OPA ("unexpected not keyword"): negate a helper rule instead
disabled if not input.enabled

double_negation if {
    not disabled
}

# Function-like rule with arguments
check_permission(user, action, resource) if {
    some role in user.roles
    action in data.permissions[role][resource]
}

# Rule generating partial set with complex condition
violations contains msg if {
    some container in input.containers
    not container.securityContext.runAsNonRoot
    msg := sprintf("Container %s must run as non-root", [container.name])
}

# Walk built-in usage
all_values contains value if {
    walk(input, [path, value])
    is_string(value)
}

# Reference with bracket notation
dynamic_access := input.items[input.index].value

# Multiple array indexing
matrix_value := input.matrix[0][1][2]

# Comparison with comprehension result
filtered_count := count([x | some x in input.items; x.active])
has_active := filtered_count > 0
