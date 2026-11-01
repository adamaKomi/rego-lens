package integration.example

# METADATA
# title: Allow admins
allow if {
	some role in input.user.roles
	role == "admin"
}

greeting := $"Hello {input.user.name}"

legacy := re_match(`^a`, "abc")
