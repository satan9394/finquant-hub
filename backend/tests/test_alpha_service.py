from app.services import alpha_service


def test_catalogue_metadata_matches_available_source():
    fields = alpha_service.list_fields()
    metadata = alpha_service.catalogue_metadata()

    assert metadata["schema_version"] == "alpha-catalogue/v1"
    assert metadata["field_count"] == len(fields)
    if metadata["mode"] == "BUNDLED_EXTERNAL":
        assert len(fields) >= 4000
        assert any(field["id"] == "ticker" for field in fields)
        assert metadata == {
            "schema_version": "alpha-catalogue/v1",
            "mode": "BUNDLED_EXTERNAL",
            "data_status": "OK",
            "source": "local_bundled_file",
            "redistribution_status": "UNKNOWN",
            "field_count": len(fields),
        }
    else:
        assert metadata == {
            "schema_version": "alpha-catalogue/v1",
            "mode": "FINQUANT_STARTER",
            "data_status": "PARTIAL",
            "source": "finquant.starter",
            "redistribution_status": "PROJECT_AUTHORED",
            "field_count": 8,
        }
        assert all(field["coverage"] is None for field in fields)


def test_catalogue_search_matches_available_source():
    results = alpha_service.search_alpha("pe_ratio", max_results=20)
    if alpha_service.catalogue_metadata()["mode"] == "BUNDLED_EXTERNAL":
        assert results
        assert any(item["type"] == "wq_field" for item in results)
    else:
        assert results == []
        starter_results = alpha_service.search_alpha("operating_income", max_results=20)
        assert starter_results[0]["type"] == "wq_field"


def test_startup_alpha_query_returns_described_field():
    """The dashboard's no-cost Alpha startup query must remain actionable."""
    results = alpha_service.search_alpha("operating_income", max_results=20)
    field = next(item for item in results if item["name"] == "operating_income")
    assert field["type"] == "wq_field"
    assert field["desc"]


def test_missing_external_catalogue_uses_project_starter_without_fabricated_coverage(tmp_path, monkeypatch):
    monkeypatch.setattr(alpha_service, "_WQ_FIELDS_PATH", tmp_path / "missing.json")

    fields = alpha_service.list_fields()
    metadata = alpha_service.catalogue_metadata()
    results = alpha_service.search_alpha("operating_income", max_results=20)

    assert metadata == {
        "schema_version": "alpha-catalogue/v1",
        "mode": "FINQUANT_STARTER",
        "data_status": "PARTIAL",
        "source": "finquant.starter",
        "redistribution_status": "PROJECT_AUTHORED",
        "field_count": 8,
    }
    assert {field["id"] for field in fields} == {
        "operating_income", "equity", "free_cash_flow_reported_value", "est_eps",
        "close", "open", "volume", "vwap",
    }
    assert all(field["coverage"] is None for field in fields)
    assert results[0]["name"] == "operating_income"
    assert results[0]["type"] == "wq_field"


def test_invalid_external_catalogue_uses_starter_for_fields_and_search(tmp_path, monkeypatch):
    invalid_catalogue = tmp_path / "wq_fields.json"
    invalid_catalogue.write_text("not-json", encoding="utf-8")
    monkeypatch.setattr(alpha_service, "_WQ_FIELDS_PATH", invalid_catalogue)
    alpha_service._read_wq_fields.cache_clear()
    alpha_service._read_wq_search_rows.cache_clear()

    assert alpha_service.catalogue_metadata()["data_status"] == "PARTIAL"
    assert len(alpha_service.list_fields()) == 8
    assert alpha_service.search_alpha("operating_income")[0]["field"] == "operating_income"
