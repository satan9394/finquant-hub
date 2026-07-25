from app.services import alpha_service


def test_real_wq_catalogue_is_loaded():
    fields = alpha_service.list_fields()
    assert len(fields) >= 4000
    assert any(field["id"] == "ticker" for field in fields)


def test_wq_search_uses_real_catalogue():
    results = alpha_service.search_alpha("pe_ratio", max_results=20)
    assert results
    assert any(item["type"] == "wq_field" for item in results)
