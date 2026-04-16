"""
Run database migrations before starting the application
"""
import sys
import subprocess

def run_migrations():
    """Run Alembic migrations"""
    print("=" * 60)
    print("Running database migrations...")
    print("=" * 60)

    try:
        result = subprocess.run(
            ["python", "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            check=True
        )
        print(result.stdout)
        if result.stderr:
            print("STDERR:", result.stderr)
        print("=" * 60)
        print("✓ Migrations completed successfully!")
        print("=" * 60)
        return 0
    except subprocess.CalledProcessError as e:
        print("=" * 60)
        print("✗ Migration failed!")
        print("=" * 60)
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
        print("=" * 60)
        return 1
    except Exception as e:
        print("=" * 60)
        print(f"✗ Unexpected error: {e}")
        print("=" * 60)
        return 1

if __name__ == "__main__":
    sys.exit(run_migrations())
