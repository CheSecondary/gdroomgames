from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0010_teamsignallog"),
    ]

    operations = [
        migrations.AddField(
            model_name="game",
            name="resume_snapshot",
            field=models.JSONField(blank=True, default=None, null=True),
        ),
    ]
