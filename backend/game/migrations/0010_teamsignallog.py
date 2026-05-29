from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("game", "0009_trickcard_team_signal"),
    ]
    operations = [
        migrations.CreateModel(
            name="TeamSignalLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("round_number", models.PositiveSmallIntegerField(default=0)),
                ("trick_number", models.PositiveSmallIntegerField(default=0)),
                ("sender_seat", models.PositiveSmallIntegerField()),
                ("sender_username", models.CharField(max_length=50)),
                ("signal", models.CharField(max_length=20)),
                ("cards_played_in_trick_at_time", models.PositiveSmallIntegerField(default=0)),
                ("game", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="signal_logs", to="game.game")),
            ],
            options={"ordering": ["round_number", "trick_number", "id"]},
        ),
    ]
