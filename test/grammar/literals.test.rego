# SYNTAX TEST "source.rego" "Strings, template strings, numbers and constants"

package test.literals

str1 := "hello world"
#       ^^^^^^^^^^^^^ string.quoted.double.rego
#       ^ punctuation.definition.string.begin.rego
#                   ^ punctuation.definition.string.end.rego

str2 := "escaped \"quotes\" here"
#                ^^ constant.character.escape.rego
#                        ^^ constant.character.escape.rego
#                               ^ string.quoted.double.rego punctuation.definition.string.end.rego

str3 := "newline\nand\ttab \\ \/ \b\f\r \u00e9"
#               ^^ constant.character.escape.rego
#                    ^^ constant.character.escape.rego
#                          ^^ constant.character.escape.rego
#                             ^^ constant.character.escape.rego
#                                ^^ constant.character.escape.rego
#                                       ^^^^^^ constant.character.escape.rego

bad_escape := "\q"
#              ^^ invalid.illegal.unrecognized-string-escape.rego

# A double-quoted string cannot span lines: it stops at the end of the line
unterminated := "oops
#               ^^^^^ string.quoted.double.rego
after_unterminated := 1
# <------------------ entity.name.function.rule.rego - string

raw1 := `raw \n string with "quotes" and # hash`
#       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ string.quoted.raw.rego
#            ^^ - constant.character.escape.rego
#                                        ^^^^^^ - comment.line.number-sign.rego

raw2 := `multi
line
# <---- string.quoted.raw.rego
raw string`
# <---------- string.quoted.raw.rego
after_raw := 1
# <--------- entity.name.function.rule.rego

# String interpolation (OPA >= 1.12)
greeting := $"Hello {input.user.name}, you have {count(input.items)} items"
#           ^ string.interpolated.rego punctuation.definition.template-string.rego
#            ^ string.interpolated.rego punctuation.definition.string.begin.rego
#             ^^^^^^ string.interpolated.rego - meta.template.expression.rego
#                   ^ meta.template.expression.rego punctuation.definition.template-expression.begin.rego
#                    ^^^^^ meta.template.expression.rego variable.language.input.rego
#                                   ^ punctuation.definition.template-expression.end.rego
#                                                ^^^^^ support.function.aggregates.rego
#                                                                         ^ punctuation.definition.string.end.rego

nested := $"{ {"a": "}"}["a"] } and {[x | x := [1, 2][_]]} done"
#             ^ punctuation.section.braces.begin.rego
#               ^ string.quoted.double.rego
#                   ^^^ string.quoted.double.rego
#                              ^^^^^ string.interpolated.rego - meta.template.expression.rego
#                                       ^ keyword.operator.comprehension.rego
#                                                          ^^^^ string.interpolated.rego - meta.template.expression.rego

escaped_brace := $"literal \{ brace and \" quote"
#                          ^^ constant.character.escape.rego
#                             ^^^^^^^^^^^^^^^^^^^ string.interpolated.rego - meta.template.expression.rego
#                                       ^^ constant.character.escape.rego

raw_template := $`multi {input.x}
#               ^ punctuation.definition.template-string.rego
#               ^^^^^^^^ string.interpolated.raw.rego
#                       ^ punctuation.definition.template-expression.begin.rego
#                        ^^^^^ variable.language.input.rego
line \{ and \n`
# <---- string.interpolated.raw.rego
#    ^^ constant.character.escape.rego
#           ^^ - constant.character.escape.rego
#             ^ punctuation.definition.string.end.rego

# Numbers (JSON numbers)
int1 := 42
#       ^^ constant.numeric.integer.rego
int2 := 0
#       ^ constant.numeric.integer.rego
float1 := 3.14
#         ^^^^ constant.numeric.float.rego
float2 := 1.5e10
#         ^^^^^^ constant.numeric.float.rego
float3 := 2.5E-5
#         ^^^^^^ constant.numeric.float.rego
float4 := 1e10
#         ^^^^ constant.numeric.float.rego
float5 := 6E+2
#         ^^^^ constant.numeric.float.rego
negative := -7
#           ^ keyword.operator.arithmetic.rego
#            ^ constant.numeric.integer.rego
illegal := 0a2b
#          ^^^^ invalid.illegal.numeric.rego
hex_is_illegal := 0x1F
#                 ^^^^ invalid.illegal.numeric.rego
index := arr[0].name1
#            ^ constant.numeric.integer.rego
#                   ^ - constant.numeric.integer.rego

# Constants
bool1 := true
#        ^^^^ constant.language.boolean.rego
bool2 := false
#        ^^^^^ constant.language.boolean.rego
nothing := null
#          ^^^^ constant.language.null.rego
empty := set()
#        ^^^ support.type.set.rego
#           ^^ - entity.name.function.call.rego
