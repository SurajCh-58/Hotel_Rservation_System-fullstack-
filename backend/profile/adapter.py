from allauth.account.adapter import DefaultAccountAdapter
class CustomAccountAdapter(DefaultAccountAdapter):
    def populate_username(self, request, user):
        if not user.username:
            user.username = self.generate_unique_username(
                [
                    user.email.split("@")[0],
                    "user",
                ]
            )
    def save_user(self, request, user, form, commit=True):
        user = super().save_user(
            request,
            user,
            form,
            commit=False,
        )
        if commit:
            user.save()
        return user