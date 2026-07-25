from app.services import alpha_service


def test_real_wq_catalogue_is_loaded():
    fields = alpha_service.list_fields()
    assert len(fields) >= 4000
    assert any(field["id"] == "ticker" for field in fields)


def test_wq_search_uses_real_catalogue():
    results = alpha_service.search_alpha("pe_ratio", max_results=20)
    assert results
    assert any(item["type"] == "wq_field" for item in results)


def test_startup_alpha_query_returns_described_field():
    """The dashboard's no-cost Alpha startup query must remain actionable."""
    results = alpha_service.search_alpha("operating_income", max_results=20)
    field = next(item for item in results if item["name"] == "operating_income")
    assert field["type"] == "wq_field"
    assert field["desc"]
