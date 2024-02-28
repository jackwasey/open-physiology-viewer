# Examples

## Basal Ganglia

The _basal ganglia_ are a group of subcortical nuclei at the base of the forebrain and top of the midbrain. The basal ganglia are associated with a variety of functions, including control of voluntary motor movements, procedural learning, habit learning, eye movements, cognition, and emotion. Basal ganglia are strongly interconnected with the cerebral cortex, thalamus, and brainstem, as well as several other brain areas.

<img src="asset/basalGanglia.png" width="100%" alt = "Basal Ganglia"/>

The ApiNATOMY [model](https://github.com/open-physiology/open-physiology-viewer/blob/master/test/data/neuronTreesAuto.json) automatically reproduces the layout from the schematic representation of the basal ganglia created by the physiology experts, given relational constraints among its constituent parts.
Conceptually, the model consists of:

* 4 context lyphs: Basal Ganglia, Putamen, Globus Pallidus external (GPe) and Globus Pallidus internal (GPi) segments;
* a model of a neuron composed of 3 parts: `dendrite` and `axon` modelled as trees
(we call them `omega trees`) and a conduit representing the axon `hillock` (a specialized part of the cell body, or soma, of a neuron that connects to the axon) that joins the omega trees on its sides.

<img src="asset/basalGanglia-components.png" width="100%" alt = "Basal Ganglia components"/>

Even though omega trees often look like simple chains in our schematics, the underlying data model
implies that a branching tree can be generated from the canonical representation given model parameters such as branching factor or  mean number of branches at each level).

Technically, the model is essentially a JSON file with 4 fields: `nodes`, `links`, `lyphs`, and `trees`. The context lyphs, Putamen, GPe and GPi, are modelled as internal lyphs of Basal Ganglia:
```json
   {
      "id"    : "bg",
      "name"  : "Basal Ganglia",
      "color" : "#d1d2d4",
      "internalLyphColumns": 3,
      "internalLyphs": [ "putamen", "gpe", "gpi" ]
   }
```
This means that they are positioned on a grid within their container lyph, and the corresponding parameter, `internalLyphColumns: 3` indicates that the grid should contain 3 columns. The number
of rows depends on the number of internal lyphs within the container.
Other space allocation methods for internal lyphs will be supported upon demand, for example,
[template-based treemaps](http://www.nkokash.com/documents/IVAPP2014-treemaps.pdf) appear to be particularly useful if we need to dedicate areas of various size to internal lyphs while preserving relevant adjacency constraints.

The nodes and links to model rotational axes of internal lyphs are auto generated (they can also be defined explicitly if a user wants to override the default properties, i.e., make them visible, or specify relationships between them and other graph entities). Thus, in our model, we only define the position and the size of the main context lyph's axis, Basal Ganglia:

```json
    "nodes": [
        { "id": "a", "layout": {"x": -100, "y": 100, "z": 0 } },
        { "id": "b", "layout": { "x": 100, "y": 100, "z": 0 } },...
    ],
    "links": [
        {
            "id"      : "main",
            "source"  : "a",
            "target"  : "b",
            "length"  : 100,
            "geometry": "invisible",
            "conveyingLyph": "bg"
        },...
    ]
```

The `trees` property is an array with 2 objects defining the `dendrite` 1-level tree and the `axonal` 5-level trees:
```json
    "trees": [
        {
          "id"          : "dendrite",
          "name"        : "Dendrite omega tree",
          "root"        : "n1",
          "numLevels"   : 1,
          "lyphTemplate": "neuronBag"
        },
        {
          "id"          : "axonal",
          "name"        : "Axonal omega tree",
          "root"        : "n2",
          "numLevels"   : 5,
          "lyphTemplate": "neuronBag"
        }
    ],
```

The tree root nodes are named `n1` and `n2`, these names are explicitly given while defining the the axis of the axon hillock, and by referring to them in the tree model, we indicate that the roots of the `axonal` and `dendrite` trees coincide with the ends of the `hillock`.

Similarly to the root nodes, it is possible to plug an external link, a node or a lyph into the generated tree at a certain level via the optional `levels` property which expects an array with (partial) link definitions (see [JSON Schema](../schema/index.html#/definitions/Tree) definition of the tree model for more details).

In the current model, we do not refer to external entities while defining the content of the tree branches. However, all auto-generated ApiNATOMY entities are also assigned IDs that can be referenced later to connect the part of the graph obtained from the tree template with the rest of the model. The identifies for auto-generated tree parts are formed using the following patterns:

* `{$tree.id}_node{$index}`
* `{$tree.id}_lnk{$index}`
* `{$tree.id}_lyph{$index}`

where `$tree.id` is the identifier of the tree, and `$index` refers to a tree level.
For the node names, the `$index` ranges from 0 to N, where N is the number of levels. Hence,
the root node corresponds to the index = 0, the end node of the tree branch at the first level - to the index = 1, and so on. For the link and lyph names, the index ranges from 1 to N. For example, the valid ID names for the basal ganglia trees:

* `axonal_node3`  - end node of the 3d level of the 'axonal' tree
* `axonal_lyph5`  - lyph at the 5th level of the 'axonal' tree,
* `dendrite_lnk1` - link at the 1st level of the 'dendrite' tree.

These names can be used to impose positional constraints on the generated entities. For example,
in our model, the axonal tree node is located on the 2nd radial border of the GPi lyph, while two axonal tree
level lyphs are hosted by (mapped to the surface of) the the GPi lyph.
```json
    {
        "id"          : "gpi",
        "name"        : "GPi",
        "color"       : "#939598",
        "height"      : 30,
        "border"      : { "borders": [ {}, {}, {}, { "hostedNodes": [ "axonal_node3" ] }]},
        "hostedLyphs" : [ "axonal_lyph4", "axonal_lyph5" ]
    }
```

Another [version](https://github.com/open-physiology/open-physiology-viewer/blob/master/test/data/neuronTrees.json) of the basal ganglia shows how one can combine explicitly assigned tree levels with auto-generated ones.

The `lyphTemplate` field in these omega tree models refers to the lyph pattern to derive the structure of the conduits in the tree branches. Firstly, the tool expands the tree template by creating the necessary graph structure (a rooted tree with the required number of levels). Secondly, the blank lyph definitions associated with the tree graph are added to the `subtypes` property of the lyph template. At the next stage, the lyph viewer will process the lyph templates: the prototype lyph layers, color and size settings are copied to all template subtypes.
Hence, at the tree expansion stage, the user definition of the template lyph:
```json
    "lyphs": [
        {
            "id"        : "neuronBag",
            "isTemplate": true,
            "topology"  : "BAG",
            "color"     : "#ccc",
            "scale": {
                "width" : 80,
                "height": 80
            },
            "layers": ["cytosol", "plasma", "fluid"]
        },...
    ]
```
is extended with the definition of subtype lyphs which will get 3 layers and will occupy each the square area with a side length computed as 80% of their axis length. Note that the `hillock` lyph also derives its structure from the `neuronBag` template, as indicated by its property `supertype`:
```json
   {
        "id"       : "hillock",
        "name"     : "Hillock",
        "supertype": "neuronBag",
        "topology" : "TUBE"
   },
```
Hence, after the generation of entities to represent required tree structures and bi-directional relationship synchronization, the user definition of the neuron template in the model will be auto-completed, i.e., the lyph template will know all lyphs that replicated its layers via its `subtypes` property:
```json
    "subtypes": [axonal_lyph1,...,axonal_lyph5, dendrite_lyph1, hillock]
```

The lyphs conveyed by the tree edges are seen as a single conduit with topological borders at the start and the end levels (root and leaves) of the tree compliant with the borders of the lyph template. In our example, the lyph template is of type `BAG`. Hence, the conveying lyphs at the end levels, `dendrite_lyph1` and `axonal_lyph5`, are of the type `BAG` while all the intermediate level lyphs, `axonal_lyph1,...,axonal_lyph4`, are of the type `TUBE`.

The topology of the `hillock` lyph, which also inherits the layer structure from the `neuronBag` lyph template, has to be explicitly defined as `TUBE` to override the inherited topology from the template.

The image below shows the layout created by the tool for the Basal Ganglia scenario based on the
resource definition explained in this section.
<img src="asset/basalGanglia-layout.png" width="75%" alt = "Basal Ganglia layout"/>

There is also an option to instruct the editor to generate 3d representation of lyphs: if a lyph's attribute `create3d` is set to `true`, the user will see 3d-dimensional lyphs when the option `lyphs 3d` in the control panel is enabled. When generating omega trees, the viewer automatically sets `create3d` to `true`, the corresponding layout for the Basal ganglia scenario is shown in the snapshot below.
<img src="asset/basalGanglia-layout3d.png" width="75%" alt = "Basal Ganglia layout"/>

The live demo of this scenario with the possibility to edit the model file in an integrated JSON editor is available [here](http://open-physiology.org/demo/open-physiology-viewer/trees).

## Urinary Omega Tree

This model illustrates the ApiNATOMY format for the urinary arborisation.
The purpose of this example is to illustrate how one can model an omega tree with branching points and resource annotation with references to external ontologies.

<img src="asset/urinaryTree.png" width="100%" alt = "Urinary Omega Tree"/>

The urinary tree [model](https://github.com/open-physiology/open-physiology-viewer/blob/master/test/data/urinaryOmegaTree.json) consists of 21 level.
Levels are defined as links conveying specific lyphs, from Intravesical Urethra to Visceral Bowman's Capsule.
The layer structure of these lyphs is modelled with the help of abstract templates that correspond to physiological tissues:
urine (URN), transitional epithelium (TE), basement membrane (BM), muscosa (Mus), muscularis (Ms1) etc.

```json
  {
      "id"        : "IU",
      "name"      : "Intravesical urethra",
      "topology"  : "TUBE",
      "length"    : {"min": 2, "max": 2},
      "thickness" : {"min": 3, "max": 3},
      "layers"    : ["URN", "Mcs", "Ms1"],
      "external"  : ["UBERON:0000057"]
  },
  {
      "id"        : "URN",
      "name"      : "Urine",
      "color"     : "#f9ed32",
      "isTemplate": true,
      "external"  : ["UBERON:0001088"]
  },
  ...
```

Whenever the specific lyphs refer to abstract lyphs as their layers, meaning that the conduit we model consists of certain tissues, the lyph viewer automatically generates lyph instances and replaces the conduit layers with the references to the generated lyphs representing tissues within the conduits, i.e., `urine in the intravesical urethra`. The generated lyphs will refer to the template via their `supertype` field and later inherit a set of template properties, namely,
 `color`, `scale`, `height`, `width`, `length`, `thickness`, as well as the references in the fields `external` and `materials`.

In the ApiNATOMY data model, trees are templates that replicate the given lyph template to the requited number of levels. However, it may be useful to define some or all of the tree levels by referring to already existing links.
This is the case when there is no common lyph template that applies to all tree levels or when the tree is part of the bigger models and its elements are connected to other parts of the graph.

The urinary omega tree below is defined in the aforementioned manner: its levels are composed of existing links that convey various lyphs. In principle, the same subgraph could be defined as a simple group, but the tree concept allows us to specify the branching patterns and automatically generate an instance of a `canonical tree`. The `canonical omega tree` is the minimal construct that is necessary to represent the structural composition of a certain organ or a physiology system, the `tree instance` is an actual arborisation that adheres to the structural, dimensional and branching patterns in the canonical tree. Due to certain degrees of freedom (probabilistic branching patterns, level dimension ranges, etc.) in the canonical trees, the tree instances we generate may vary.

```json
  "trees" : [
    {
      "id"          : "UOT",
      "name"        : "Urinary Omega Tree",
      "root"        : "uot-a",
      "numLevels"   : 21,
      "levels"      : ["uot-lnk1", "uot-lnk2", "uot-lnk3", "uot-lnk4", "uot-lnk5", "uot-lnk6", "uot-lnk7", "uot-lnk8", "uot-lnk9", "uot-lnk10",
         "uot-lnk11", "uot-lnk12","uot-lnk13", "uot-lnk14", "uot-lnk15", "uot-lnk16", "uot-lnk17","uot-lnk18","uot-lnk19", "uot-lnk20", "uot-lnk21"
      ],
      "branchingFactors": [1, 1, 2, 1, 1, 1, 3],
      "comment": "Branching factors for the rest of the tree removed to avoid state explosion ... 3, 20, 8, 9, 8, 9, 1, 1, 1, 1, 1, 1, 1, 1"
    }
  ]
```

The images below show the canonical omega tree for the Urinary system model in 2d and 3d.

<img src="asset/urinaryTree-layout.png" width="75%" alt = "Urinary system - canonical omega tree"/>

<img src="asset/urinaryTree-layout3d.png" width="75%" alt = "Urinary system - canonical omega tree in 3d"/>

The next image shows the snapshot of the omega tree instance with branching in levels 3 and 7. The actual model of the urinary omega tree has more branching points, but due to the number of visual elements needed to represent the entire model (appr. 90 million), the viewer cannot handle all of them in the same view. If necessary, we recommend to explore different branching points separately by setting branching factor for other levels to 1.

<img src="asset/urinaryTree-instance.png" width="75%" alt = "Urinary system - partially generated omega tree instance"/>

In this model, several subgroups of items are annotated with a single ontology term. We can represent such a many-to-one mapping by defining and annotating subgroups. hence, in the ApiMATOMY model for this system, you can find subgroups defining a nephron and a loop of Henle, with the corresponding UBERON term IDs.

```json
"groups": [
    {
      "id"      : "nephron",
      "name"    : "Nephron",
      "nodes"   : ["uot-m", "uot-n", "uot-o","uot-p","uot-q","uot-r","uot-s","uot-t","uot-u","uot-v"],
      "links"   : [ "uot-lnk13", "uot-lnk14", "uot-lnk15", "uot-lnk16", "uot-lnk17", "uot-lnk18", "uot-lnk19", "uot-lnk20", "uot-lnk21"],
      "lyphs"   : ["DCT", "FPofTAL", "DST", "ATL", "DTL", "PST", "PCT", "PBC", "VBC"],
      "external": ["UBERON:0001285"]
    },
    {
      "id"      : "henle",
      "name"    : "Loop of Henle",
      "nodes"   : ["uot-n","uot-o","uot-p","uot-q","uot-r"],
      "links"   : ["uot-lnk14", "uot-lnk15", "uot-lnk16", "uot-lnk17"],
      "lyphs"   : ["FPofTAL", "DST", "ATL", "DTL"],
      "external": ["UBERON:0001288"]
    }
]
```

To instruct the viewer to stretch the tree from left to right, we add layout constraints to the tree root and leaf nodes. We also rely on the `assign` property and JSON path expressions to customize the appearance of the nodes and lyphs: the nodes' color is set to `red` while the main conveying lyphs are set to the neutral grey color.
```json
 "assign": [
    {
      "path" : "$.nodes[*]",
      "value": { "color" : "red"}
    },
    {
      "path"  : "$.links[*].conveyingLyph",
      "value" : { "color" : "#ccc" }
    }
  ]
```


## Bolser-Lewis map

Please note that this example shows a rough work-in-progress model that demonstrates the use of modeling concepts rather than preserves the physiological accuracy!

The example is based on a mock-up for the Bolser-Lewis model

<img src="asset/bolserLewis.png" width="75%" alt = "Bolser-Lewis model mock-up"/>

The model author defined the necessary resources in the Excel format. The image below shows the snapshot of the Excel template we developed as alternative to the text-based JSON format. The model from the Excel template can be exported as an .xlsx file and opened from the ApiNATOMY model viewer. The integrated converter translates the model to the JSON-based input format.

<img src="asset/bolserLewis-excelLyphs.png" width="75%" alt = "Bolser-Lewis model Excel page: lyphs"/>

The model shows the neuron tree passing through a chain of body compartments. As a requirement, the author wanted to generate the chain given an ordered list of conveying lyphs:

<img src="asset/bolserLewis-excelChain.png" width="75%" alt = "Bolser-Lewis model Excel page: chains"/>

The chain template shown in the image above produces a chain of connected links that convey the lyphs from the chain's `conveyingLyphs` property:

<img src="asset/chain.png" width="75%" alt = "A group generated from the chain template"/>

The neuron tree needs to be generated to match the number of housing lyphs:

<img src="asset/bolserLewis-excelTree.png" width="75%" alt = "Bolser-Lewis model Excel page: trees"/>

The specification above does not set `numLevels` or `levels` fields; instead the size of the `housingLyphs` array here is used to determine the number of generated tree levels; each tree level is then "embedded" to the corresponding housing lyph. This implies that the tree level link ends are hosted by the housing lyph or, in case of layered lyphs, its outermost layer
(`hostedBy` relationship is set).

<img src="asset/chain-housedTree.png" width="75%" alt = "An omega tree housed by a set of lyphs which are part of the chain group"/>

Moreover, an embedding coalescence is defined between the pairs of the housing lyphs and the conveying lyphs of the tree levels they house.

<img src="asset/chain-housedTreeCoalescence.png" width="75%" alt = "Embedded lyphs coalesce with their housing lyphs"/>

One can observe that the generated omega tree has collapsible "spacer" links. These links should disappear in the views that do not require the same node to appear in two different locations (i.e., on borders of adjacent lyphs which are displayed with a gap). The lyph viewer determines whether spacer link ends are constrained based on the visibility of the related resources.

<img src="asset/chain-tree.png" width="75%" alt = "A group generated from the tree template"/>


## Variance in species

Variance handling fields appear in the Settings panel after loading a model with a variance specification.
The image below gives an example of such a specification within the WBKG (Whole Body Knowledge Graph) ApiNATOMY model.
Lyphs are annotated with the help of the `varianceSpecs` field.  

<img src="asset/variance-exampleSpec.png" width="40%" alt = "Variance specification"/>

By default, we show the maximal possible chain. When a variance spec is enabled via the settings panel, a combobox allows 
a user to select a clade. We mainly need to worry about the field `presence` set to the value `absent`.
When a clade is selected, lyphs annotated as `absent` will be excluded from the model.
The image below shows the clade options available in the comb0-box of the Variance tab within the Settings panel.

<img src="asset/variance-clades.png" width="30%" alt = "Full model"/>

Screenshots below show the Infraventricular-csf-tract: 
  * full chain, 
  * NCBITAxon:9989 vs-not-rodent variance (lyph-L6-spinal-segment absent),
  * NCBITaxon:9606 vs-not-human variance (lyph-L6-spinal-segment and lyph-T13-spinal-segment absent)

<img src="asset/variance-full.png" alt = "Full model"/>

<img src="asset/variance-rodents.png" alt = "Variance chain for rodents"/>

<img src="asset/variance-human.png" alt = "Variance chain for humans"/>

