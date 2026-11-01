# SYNTAX TEST "source.rego" "Keywords, package and imports"

package test.keywords
# <------- keyword.control.package.rego
#       ^^^^^^^^^^^^^ entity.name.namespace.rego

package a.b["with-dash"].c
#       ^^^^^^^^^^^^^^^^^^ entity.name.namespace.rego

import future.keywords.if
# <------ keyword.control.import.rego
#      ^^^^^^^^^^^^^^^^^^ entity.name.import.rego

import rego.v1
#      ^^^^^^^ entity.name.import.rego

import rego.v2
#      ^^^^^^^ entity.name.import.rego

import data.lib.helpers as h
# <------ keyword.control.import.rego
#      ^^^^^^^^^^^^^^^^ entity.name.import.rego
#                       ^^ keyword.control.as.rego
#                          ^ entity.name.alias.rego

import input.request
#      ^^^^^^^^^^^^^ entity.name.import.rego

default allow := false
# <------- keyword.control.rego
#       ^^^^^ entity.name.function.rule.rego
#             ^^ keyword.operator.assignment.rego
#                ^^^^^ constant.language.boolean.rego

allow if {
#     ^^ keyword.control.rego
    some x in input.items
#   ^^^^ keyword.control.rego
#        ^ - keyword.control.rego
#          ^^ keyword.control.rego
#             ^^^^^ variable.language.input.rego
    some k, v in input.map
#   ^^^^ keyword.control.rego
#             ^^ keyword.control.rego
    not denied
#   ^^^ keyword.control.rego
#       ^^^^^^ - entity.name.function.rule.rego
}

result := value if {
#      ^^ keyword.operator.assignment.rego
#               ^^ keyword.control.rego
    value := 1
#   ^^^^^ - entity.name.function.rule.rego
} else := other
# ^^^^ keyword.control.rego
#      ^^ keyword.operator.assignment.rego

result := 3 if {
    false
} else if {
# ^^^^ keyword.control.rego
#      ^^ keyword.control.rego
    true
}

check_all if {
    every item in input.items {
#   ^^^^^ keyword.control.rego
#              ^^ keyword.control.rego
        item.valid
    }
    every k, v in input.labels {
#   ^^^^^ keyword.control.rego
        startswith(k, "app")
    }
}

deny contains msg if {
# <---- entity.name.function.rule.rego
#    ^^^^^^^^ keyword.control.rego
#                 ^^ keyword.control.rego
    msg := "denied"
}

uses_contains_builtin if contains("abc", "b")
#                        ^^^^^^^^ support.function.strings.rego
#                        ^^^^^^^^ - keyword.control.rego

mocked if {
    allow with input as {"user": "alice"} with data.roles as {}
#         ^^^^ keyword.control.rego
#              ^^^^^ variable.language.input.rego
#                    ^^ keyword.control.rego
#                                         ^^^^ keyword.control.rego
#                                              ^^^^ variable.language.data.rego
#                                                         ^^ keyword.control.rego
}

# `and` / `or` (import future.keywords.and / future.keywords.or, or import rego.v2)
logical if input.a and input.b or not input.c
#                  ^^^ keyword.operator.logical.rego
#                              ^^ keyword.operator.logical.rego
#                                 ^^^ keyword.control.rego

# Keywords used as ref segments are plain identifiers (capability keywords_in_refs)
refs := [input.in, input.contains, data.if, input.not, x.or, y.and, z.default]
#              ^^ - keyword.control.rego
#                        ^^^^^^^^ - keyword.control.rego
#                                       ^^ - keyword.control.rego
#                                                 ^^^ - keyword.control.rego
#                                                        ^^ - keyword.operator.logical.rego
#                                                              ^^^ - keyword.operator.logical.rego
#                                                                     ^^^^^^^ - keyword.control.rego

# Words that merely contain a keyword are not keywords
ifx := [notify, inside, someone, android, orange, everything, within]
#       ^^^^^^ - keyword.control.rego
#               ^^^^^^ - keyword.control.rego
#                       ^^^^^^^ - keyword.control.rego
#                                ^^^^^^^ - keyword.operator.logical.rego
#                                         ^^^^^^ - keyword.operator.logical.rego
#                                                 ^^^^^^^^^^ - keyword.control.rego
#                                                             ^^^^^^ - keyword.control.rego

wildcard if input.list[_] == 1
#                      ^ variable.language.wildcard.rego
