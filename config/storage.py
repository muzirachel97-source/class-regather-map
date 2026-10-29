from whitenoise.storage import CompressedManifestStaticFilesStorage


class ModuleStaticStorage(CompressedManifestStaticFilesStorage):
    support_js_module_import_aggregation = True
