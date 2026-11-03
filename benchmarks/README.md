# Historical benchmarks and reproducibility

`engine/source/` contains the seven TSX fixture sources and `engine/references/`
contains retained scene metadata. Historical benchmarking archives are **not**
new benchmark results from this Git migration. Use interleaved re-runs with
fixed input sources and revalidated outputs for performance decisions.
Run data are ignored under `benchmarks/results/`.

Remotion is an **external reference renderer**. Benchmark integration must call its installed public API or CLI only, without copying its source code, installed packages, or bundled output into the Git repository. Run Miniator and Remotion independently and compare matched source, input props, frame output and codec settings.

To invoke the external benchmark opponent without vendoring any source:

```sh
npm run benchmark:remotion -- render <entry> <composition> <output> [options]
```

Miniator does not bundle or copy Remotion code. The command simply forwards arguments to the locally installed Remotion CLI. Use a separate workspace/output directory for comparisons; matched input parameters and visual fidelity still require the reproducible harness.
