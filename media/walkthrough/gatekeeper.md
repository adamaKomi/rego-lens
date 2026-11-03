# Errors on the YAML lines

Open or save a `ConstraintTemplate`: each error in its Rego is shown on the YAML line where it is, with the
message of the OPA compiler.

```yaml
            rego: |
              package k8srequiredlabels

              violation contains {"msg": msg} if {
                count(missng) > 0      # var missng is unsafe
              }
```

Like Gatekeeper, the legacy `rego` and `libs` fields are read as Rego v0, and `code[].source` as v0 unless
`version: "v1"`.

The check runs `opa check` when opa is installed (on the `PATH`, or set by the official OPA extension), and
otherwise `regodrill check`, which gives the same results. regodrill is downloaded once from its
[GitHub releases](https://github.com/adamaKomi/regodrill/releases) when you agree, and its SHA-256 is
checked. Both are off in Restricted Mode.
