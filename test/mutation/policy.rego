package authz

allow if {
	input.user.age >= 18
	input.user.active
}
