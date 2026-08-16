from django import forms


class CustomSignupForm(forms.Form):
    full_name = forms.CharField(
        max_length=150,
        required=True,
    )

    def clean_full_name(self):
        full_name = self.cleaned_data.get("full_name", "").strip()

        if not full_name:
            raise forms.ValidationError(
                "This field is required.",
                code="required",
            )

        return full_name

    def signup(self, request, user):
        user.full_name = self.cleaned_data["full_name"]
        user.save(update_fields=["full_name"])