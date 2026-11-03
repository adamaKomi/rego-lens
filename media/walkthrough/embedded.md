# Rego where it lives

**Gatekeeper templates**: the `rego` and `libs` fields are highlighted as Rego.

```yaml
apiVersion: templates.gatekeeper.sh/v1
kind: ConstraintTemplate
spec:
  targets:
    - target: admission.k8s.gatekeeper.sh
      code:
        - engine: Rego
          source:
            version: "v1"
            rego: |
              package k8srequiredlabels

              violation contains {"msg": msg} if {
                missing := {l | some l in input.parameters.labels} - {l | input.review.object.metadata.labels[l]}
                count(missing) > 0
                msg := sprintf("missing labels: %v", [missing])
              }
```

**ConfigMaps**: any YAML key ending in `.rego` (`policy.rego: |`).

**Markdown**: code blocks marked `rego`.

**Snippets** in `.rego` files: `func` (function), `meta` (METADATA annotation block), `tmpl` (template
string, OPA 1.12 or later).
