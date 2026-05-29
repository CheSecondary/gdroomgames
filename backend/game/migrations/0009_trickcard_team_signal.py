from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [
        ("game", "0008_bidlog_all_scores_before_round_and_more"),
    ]
    operations = [
        migrations.AddField(
            model_name="trickcard",
            name="team_signal",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
    ]
