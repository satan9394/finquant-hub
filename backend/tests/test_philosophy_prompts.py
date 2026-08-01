from pathlib import Path


PROMPT_ROOT = Path(__file__).parents[1] / "app" / "prompts" / "philosophy"


def test_value_investing_philosophy_prompts_are_complete_and_honest():
    expected = {
        "buffett.md": ("能力圈", "安全边际", "反证"),
        "munger.md": ("反向", "激励", "机会成本"),
        "duan_yongping.md": ("生意模式", "差异化", "不做清单"),
    }

    for filename, concepts in expected.items():
        content = (PROMPT_ROOT / filename).read_text(encoding="utf-8")
        assert all(concept in content for concept in concepts)
        assert "unknown" in content
        assert "不模仿本人语气" in content
