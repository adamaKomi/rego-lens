<!-- SYNTAX TEST "text.html.markdown" "Rego fenced code blocks in Markdown"

# Policy documentation

```rego
<!-- <------- markup.fenced_code.block.markdown
package example
<!-- <------- meta.embedded.block.rego keyword.control.package.rego

# METADATA
# title: Allow
<!-- <~~----- meta.embedded.block.rego entity.name.tag.metadata.rego
allow if input.user == "admin"
<!-- <----- meta.embedded.block.rego entity.name.function.rule.rego
```

After the block, `inline code` and **bold** are Markdown again.
<!-- <----- - meta.embedded.block.rego

~~~Rego {title="policy.rego"}
default allow := false
<!-- <------- meta.embedded.block.rego keyword.control.rego
~~~

- a list item:

  ```rego
  deny contains "x" if true
<!-- <~~---- meta.embedded.block.rego entity.name.function.rule.rego
  ```

> ```rego
> package quoted
<!-- <~~------- meta.embedded.block.rego keyword.control.package.rego
> ```

<!-- Same behaviour as VS Code's built-in fences: a shorter fence line inside is not embedded code, the block continues -->
````rego
```
<!-- <--- markup.fenced_code.block.markdown
nested_fence_is_content := true
<!-- <----------------------- meta.embedded.block.rego entity.name.function.rule.rego
````

```regoish
package not_rego
<!-- <------- - meta.embedded.block.rego
```

```
package unlabelled
<!-- <------- - meta.embedded.block.rego
```

```yaml
rego: |
  package inside_another_fence
<!-- <~~------- - meta.embedded.block.rego
```

The end.
<!-- <-------- - meta.embedded.block.rego
