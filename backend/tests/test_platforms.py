import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.features.system.cuda import configure_dll_search
from app.shared.catalog import (
    CPU_VARIANT,
    CUDA_VARIANT,
    load_catalog,
    model_catalog,
    runtime_catalog,
    supported_models,
)
from app.shared.downloads import write_manifest
from app.shared.platforms import LINUX_X64, PLATFORMS, WINDOWS_X64, Platform, platform_name


def installable(target: Platform, filename: str) -> bool:
    return filename.endswith("-any.whl") or target.accepts_wheel(filename)


class PlatformNameTests(unittest.TestCase):
    def test_host_names_are_normalized(self):
        self.assertEqual(platform_name("win32", "AMD64"), "win_amd64")
        self.assertEqual(platform_name("linux", "x86_64"), "linux_x86_64")
        self.assertEqual(platform_name("linux", "aarch64"), "linux_arm64")
        self.assertEqual(platform_name("darwin", "arm64"), "macos_arm64")

    def test_supported_platforms(self):
        self.assertEqual(set(PLATFORMS), {"win_amd64", "linux_x86_64"})


class WheelTagTests(unittest.TestCase):
    def test_windows_accepts_only_windows_wheels(self):
        self.assertTrue(WINDOWS_X64.accepts_wheel("pkg-1.0-py3-none-win_amd64.whl"))
        self.assertFalse(WINDOWS_X64.accepts_wheel("pkg-1.0-py3-none-manylinux2014_x86_64.whl"))

    def test_linux_accepts_compatible_manylinux_wheels(self):
        accepts = LINUX_X64.accepts_wheel
        self.assertTrue(accepts("pkg-1.0-py3-none-manylinux2014_x86_64.whl"))
        self.assertTrue(
            accepts("pkg-1.0-cp310-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl")
        )
        self.assertTrue(accepts("pkg-1.0-cp312-cp312-manylinux_2_28_x86_64.whl"))
        self.assertFalse(accepts("pkg-1.0-cp312-cp312-manylinux_2_34_x86_64.whl"))
        self.assertFalse(accepts("pkg-1.0-py3-none-manylinux2014_aarch64.whl"))
        self.assertFalse(accepts("pkg-1.0-py3-none-win_amd64.whl"))


class PlatformCatalogTests(unittest.TestCase):
    def test_every_platform_has_every_runtime_variant(self):
        for target in PLATFORMS.values():
            runtimes = runtime_catalog(target)
            self.assertEqual(set(runtimes), {"vieneu", "torch"}, target.name)
            self.assertEqual(set(runtimes["torch"].variants), {CPU_VARIANT, CUDA_VARIANT})
            wheels = [
                wheel.filename
                for runtime in runtimes.values()
                for variant in runtime.variants.values()
                for wheel in variant.wheels
            ]
            foreign = [name for name in wheels if not installable(target, name)]
            self.assertEqual(foreign, [], target.name)

    def test_unsupported_platform_drops_runtime_models(self):
        with patch("app.shared.catalog.current_platform", return_value=None):
            catalog = load_catalog()
        self.assertEqual(catalog.runtimes, {})
        self.assertEqual(catalog.cuda.packages, ())
        self.assertEqual(catalog.models, ())

    def test_models_need_their_runtime_on_the_platform(self):
        models = model_catalog()
        self.assertEqual(supported_models(models, {}), ())
        self.assertEqual(len(supported_models(models, runtime_catalog(LINUX_X64))), len(models))


class LinuxLibrarySearchTests(unittest.TestCase):
    def test_lib_directories_are_prepended_to_the_loader_path(self):
        with tempfile.TemporaryDirectory() as directory:
            cuda_dir = Path(directory)
            (cuda_dir / "nvidia" / "cublas" / "lib").mkdir(parents=True)
            write_manifest(cuda_dir, {"totalBytes": 0})
            with patch.dict(os.environ, {"LD_LIBRARY_PATH": "/usr/lib"}):
                directories = configure_dll_search(cuda_dir, LINUX_X64)
                value = os.environ["LD_LIBRARY_PATH"]
            expected = str(cuda_dir / "nvidia" / "cublas" / "lib")
            self.assertEqual([str(path) for path in directories], [expected])
            self.assertEqual(value, os.pathsep.join([expected, "/usr/lib"]))

    def test_nothing_changes_without_library_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            write_manifest(Path(directory), {"totalBytes": 0})
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(configure_dll_search(Path(directory), LINUX_X64), [])
                self.assertNotIn("LD_LIBRARY_PATH", os.environ)
