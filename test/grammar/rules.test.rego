# SYNTAX TEST "source.rego" "Rule heads, bodies and functions"

package test.rules

allow if input.user.admin
# <----- entity.name.function.rule.rego

allow if {
# <----- entity.name.function.rule.rego
    x := 1
#   ^ - entity.name.function.rule.rego
    y = x
#   ^ - entity.name.function.rule.rego
    allowed_ids[x]
#   ^^^^^^^^^^^ - entity.name.function.rule.rego
}

pi := 3.14
# <-- entity.name.function.rule.rego

fruit.color.red := "red"
# <--------------- entity.name.function.rule.rego

partial_set[x] if {
# <----------- entity.name.function.rule.rego
    some x in input.xs
}

partial_obj[k] := v if {
# <----------- entity.name.function.rule.rego
    some k, v in input.obj
}

is_admin(user) if {
# <-------- entity.name.function.rule.rego
    user.role == "admin"
}

double(x) := y if y := x * 2
# <------ entity.name.function.rule.rego

test_allow_admin if {
# <---------------- entity.name.function.rule.rego
    allow with input as {"user": {"admin": true}}
#   ^^^^^ - entity.name.function.rule.rego
}

v0_style {
# <-------- entity.name.function.rule.rego
    true
}

multi_line := [
# <---------- entity.name.function.rule.rego
    "a",
    item_like_a_rule := 1,
#   ^^^^^^^^^^^^^^^^ - entity.name.function.rule.rego
]

obj := {
    "k": value_inside_object,
#        ^^^^^^^^^^^^^^^^^^^ - entity.name.function.rule.rego
    key_ident: 1,
#   ^^^^^^^^^ - entity.name.function.rule.rego
}

call := f(
    arg_on_next_line,
#   ^^^^^^^^^^^^^^^^ - entity.name.function.rule.rego
)

result := "a" if {
    false
} else := "b" if {
# ^^^^ keyword.control.rego - entity.name.function.rule.rego
    true
}

    indented_rule := 1
#   ^^^^^^^^^^^^^ entity.name.function.rule.rego

after_braces_closed := true
# <------------------- entity.name.function.rule.rego
