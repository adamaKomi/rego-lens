# Tests that pass are not always tests that catch bugs

```rego
allow if {
	input.user.age >= 18
	input.user.active
}
```

```rego
test_adult_allowed if allow with input as {"user": {"age": 30, "active": true}}
test_minor_denied if not allow with input as {"user": {"age": 10, "active": true}}
```

These tests pass, and every line runs. Yet:

| Change | Tests |
|---|---|
| `>=` becomes `>` | still pass: no test at age 18 |
| `input.user.active` removed | still pass: no test with an inactive user |

**Mutation testing** makes such changes one at a time and runs your tests after each one. A change that no
test notices is shown in the editor, with a hover that names the tests that run the line. Above each rule, a
summary such as `allow: 4/8 mutants killed`, and the score in the status bar.

It runs [regodrill](https://github.com/adamaKomi/regodrill), downloaded once from GitHub when you agree (its
SHA-256 is checked), or the regodrill on your `PATH`. Nothing runs until you start it.
