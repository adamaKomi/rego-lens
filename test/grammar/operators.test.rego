# SYNTAX TEST "source.rego" "Operators and comprehensions"

package test.operators

val1 := "assigned"
#    ^^ keyword.operator.assignment.rego

val2 = "unified"
#    ^ keyword.operator.unification.rego

cmp if {
    x == y
#     ^^ keyword.operator.comparison.rego
    x != y
#     ^^ keyword.operator.comparison.rego
    x < y
#     ^ keyword.operator.comparison.rego
    x > y
#     ^ keyword.operator.comparison.rego
    x <= y
#     ^^ keyword.operator.comparison.rego
    x >= y
#     ^^ keyword.operator.comparison.rego
    [a, b] = [1, 2]
#          ^ keyword.operator.unification.rego
}

arith := ((a + b) - (c * d)) / (e % f)
#            ^ keyword.operator.arithmetic.rego
#                 ^ keyword.operator.arithmetic.rego
#                      ^ keyword.operator.arithmetic.rego
#                            ^ keyword.operator.arithmetic.rego
#                                 ^ keyword.operator.arithmetic.rego

inter := s1 & s2
#           ^ keyword.operator.set.rego

union := s1 | s2
#           ^ keyword.operator.set.rego

arr := [x | some x in input.xs; x > 1]
#         ^ keyword.operator.comprehension.rego
#                             ^ punctuation.terminator.statement.rego

arr_union := [x | x := s1 | s2]
#               ^ keyword.operator.comprehension.rego
#                         ^ keyword.operator.set.rego

set_compr := {x | some x in input.xs}
#               ^ keyword.operator.comprehension.rego

obj_compr := {k: v | some k, v in input.obj}
#              ^ punctuation.separator.key-value.rego
#                  ^ keyword.operator.comprehension.rego

obj := {"a": 1, "b": [1, 2]}
#          ^ punctuation.separator.key-value.rego
#             ^ punctuation.separator.comma.rego

ref := input.a.b["c"][0]
#           ^ punctuation.accessor.rego
#               ^ punctuation.section.brackets.begin.rego
#                   ^ punctuation.section.brackets.end.rego
