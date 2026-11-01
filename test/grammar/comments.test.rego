# SYNTAX TEST "source.rego" "Comments and METADATA annotation blocks"

# This is a comment
# <- comment.line.number-sign.rego punctuation.definition.comment.rego
#^^^^^^^^^^^^^^^^^^ comment.line.number-sign.rego

package test.comments # inline comment
#                     ^^^^^^^^^^^^^^^^ comment.line.number-sign.rego

# Comment with code inside: x := 1 + 2 if { "s" }
#                           ^^^^^^^^^^^^^^^^^^^^^ comment.line.number-sign.rego
#                             ^^ - keyword.operator.assignment.rego
#                                      ^^ - keyword.control.rego

rule if {
    # comment inside a rule body
#   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^ comment.line.number-sign.rego
    true
}

x := "# not a comment" # but this is
#     ^^^^^^^^^^^^^^^^ string.quoted.double.rego
#     ^^^^^^^^^^^^^^^^ - comment.line.number-sign.rego
#                      ^^^^^^^^^^^^^ comment.line.number-sign.rego

##############################
# <- comment.line.number-sign.rego

# METADATA
# <- comment.block.documentation.metadata.rego punctuation.definition.comment.rego
# ^^^^^^^^ comment.block.documentation.metadata.rego storage.type.metadata.rego
# title: Allow admins
# ^^^^^ comment.block.documentation.metadata.rego entity.name.tag.metadata.rego
#      ^ comment.block.documentation.metadata.rego punctuation.separator.key-value.metadata.rego
#        ^^^^^^^^^^^^ comment.block.documentation.metadata.rego - entity.name.tag.metadata.rego
# authors:
# ^^^^^^^ entity.name.tag.metadata.rego
# - name: Jane Doe
# ^ punctuation.definition.list.metadata.rego
#   ^^^^ entity.name.tag.metadata.rego
#   email: jane@example.com
#   ^^^^^ entity.name.tag.metadata.rego
# related_resources:
# - https://example.com/docs
# ^ punctuation.definition.list.metadata.rego
#   ^^^^^^^^^^^^^^^^^^^^^^^^ comment.block.documentation.metadata.rego - entity.name.tag.metadata.rego
# entrypoint: true
# ^^^^^^^^^^ entity.name.tag.metadata.rego
allow if input.user.admin
# <----- entity.name.function.rule.rego - comment

  # METADATA
# ^^^^^^^^^^ comment.line.number-sign.rego - comment.block.documentation.metadata.rego
