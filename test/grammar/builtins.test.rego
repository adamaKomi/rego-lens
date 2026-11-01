# SYNTAX TEST "source.rego" "Built-in functions (generated from OPA capabilities)"

package test.builtins

agg := count(input.items) + sum([1, 2]) + max([1]) + min([1]) + product([1])
#      ^^^^^ support.function.aggregates.rego
#                           ^^^ support.function.aggregates.rego
#                                         ^^^ support.function.aggregates.rego
#                                                    ^^^ support.function.aggregates.rego
#                                                               ^^^^^^^ support.function.aggregates.rego

str := sprintf("%s", [concat(",", split(lower(upper("A")), ","))])
#      ^^^^^^^ support.function.strings.rego
#                     ^^^^^^ support.function.strings.rego
#                                 ^^^^^ support.function.strings.rego
#                                       ^^^^^ support.function.strings.rego
#                                             ^^^^^ support.function.strings.rego

dotted := [io.jwt.decode(t), crypto.x509.parse_certificates(c), providers.aws.sign_req(r, k, n)]
#          ^^^^^^^^^^^^^ support.function.tokens.rego
#                            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ support.function.crypto.rego
#                                                               ^^^^^^^^^^^^^^^^^^^^^^ support.function.providers.aws.rego

recent := [strings.render_template(t, v), array.flatten(a), json.match_schema(d, s)]
#          ^^^^^^^^^^^^^^^^^^^^^^^ support.function.strings.rego
#                                         ^^^^^^^^^^^^^ support.function.array.rego
#                                                           ^^^^^^^^^^^^^^^^^ support.function.object.rego

more := [regex.match(p, s), time.now_ns(), net.cidr_contains(c, i), http.send(r), is_string(x)]
#        ^^^^^^^^^^^ support.function.regex.rego
#                           ^^^^^^^^^^^ support.function.time.rego
#                                          ^^^^^^^^^^^^^^^^^ support.function.net.rego
#                                                                   ^^^^^^^^^ support.function.http.rego
#                                                                                 ^^^^^^^^^ support.function.types.rego

spaced := count (input.items)
#         ^^^^^ support.function.aggregates.rego

debug if {
    print("x", 1)
#   ^^^^^ support.function.builtin.rego
    trace("y")
#   ^^^^^ support.function.tracing.rego
}

# Deprecated built-ins were removed from Rego v1 (OPA 1.0)
old := [any(xs), all(xs), re_match(p, s), set_diff(a, b), cast_string(x), net.cidr_overlap(c, i)]
#       ^^^ invalid.deprecated.builtin.rego
#                ^^^ invalid.deprecated.builtin.rego
#                         ^^^^^^^^ invalid.deprecated.builtin.rego
#                                         ^^^^^^^^ invalid.deprecated.builtin.rego
#                                                         ^^^^^^^^^^^ invalid.deprecated.builtin.rego
#                                                                         ^^^^^^^^^^^^^^^^ invalid.deprecated.builtin.rego

# A built-in name that is not called is not a built-in call
fields := [input.count, input.sum, count, data.http.send]
#                ^^^^^ - support.function.aggregates.rego
#                             ^^^ - support.function.aggregates.rego
#                                  ^^^^^ - support.function.aggregates.rego
#                                                   ^^^^ - support.function.http.rego

# A function with a built-in's name under another namespace is a user function
custom := [data.lib.count(x), input.user.lower(y), mylib.sprintf(z)]
#                   ^^^^^ entity.name.function.call.rego - support.function.aggregates.rego
#                                        ^^^^^ entity.name.function.call.rego - support.function.strings.rego
#                                                        ^^^^^^^ entity.name.function.call.rego - support.function.strings.rego

user_calls := [is_admin(input.user), data.authz.allowed(input)]
#              ^^^^^^^^ entity.name.function.call.rego
#                                               ^^^^^^^ entity.name.function.call.rego

# Prefix of a real built-in name
prefixes := [counter(x), sprintfx(y), time.now_ns_extra(z)]
#            ^^^^^^^ entity.name.function.call.rego - support.function.aggregates.rego
#                        ^^^^^^^^ entity.name.function.call.rego - support.function.strings.rego
#                                          ^^^^^^^^^^^^ - support.function.time.rego
