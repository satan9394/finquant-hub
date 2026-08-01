from app.services.alpha_templates import generate_factor_templates


def test_templates_are_generated_only_from_available_fields():
    fields = [
        {"id": "operating_income", "description": "Operating income", "coverage": 0.9},
        {"id": "equity", "description": "Equity", "coverage": 0.8},
    ]

    templates = generate_factor_templates(fields)

    assert [item["id"] for item in templates] == ["fundamental_quality"]
    assert templates[0]["fields"][0]["description"] == "Operating income"
    assert "operating_income / equity" in templates[0]["expression"]


def test_bundled_catalogue_produces_practical_templates():
    templates = generate_factor_templates()

    assert len(templates) == 5
    assert all(item["fields"] for item in templates)
    assert all(item["settings"]["delay"] == 1 for item in templates)
