import { useState, useEffect, useRef } from 'react'
import './App.css'
import {
  Grid,
  Typography,
  List,
  ListItem,
  ListItemText,
  Divider,
  FormControl,
  FormLabel,
  FormControlLabel,
  RadioGroup,
  Radio,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Slider,
  Box,
  Tab,
  Select,
  MenuItem,
  InputLabel,
  CircularProgress,
  Backdrop,
  Checkbox,
  ListSubheader,
  Button,
  Switch,
  FormGroup,
  Stack,
  IconButton,
  TextField,
  SwipeableDrawer,
} from '@mui/material';
import {
  TabContext,
  TabList,
  TabPanel,
} from '@mui/lab';
import Add from '@mui/icons-material/Add';
import { Global } from '@emotion/react';
import { styled } from '@mui/material/styles';
import { grey, lightBlue } from '@mui/material/colors';

import DeckGL from '@deck.gl/react';
import { PointCloudLayer, LineLayer } from '@deck.gl/layers';
import { OrbitView } from '@deck.gl/core';

import { runUmapAsync } from './utils/umap.js';
import { runPca } from './utils/pca.js';
import { request as requestGemini } from './utils/gemini.js';

// change to node_modules module
import jszip from "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm";

const drawerBleeding = 50;

const StyledBox = styled('div')(({ theme }) => ({
  backgroundColor: '#fff',
  ...theme.applyStyles('dark', {
    backgroundColor: grey[800],
  }),
}));

const Puller = styled('div')(({ theme }) => ({
  width: 30,
  height: 6,
  backgroundColor: grey[300],
  borderRadius: 3,
  position: 'absolute',
  top: 8,
  left: 'calc(50% - 15px)',
  ...theme.applyStyles('dark', {
    backgroundColor: grey[900],
  }),
}));

function euclideanDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error("Points must have the same dimensions");
  }

  return Math.sqrt(
    a
      .map((coord, index) => Math.pow(coord - b[index], 2))
      .reduce((sum, squaredDiff) => sum + squaredDiff, 0)
  );
}

function cosineDistance(a, b) {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same dimensions");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += Math.pow(a[i], 2);
    magnitudeB += Math.pow(b[i], 2);
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function App() {
  const [data, setData] = useState([]);
  const [pointData, setPointData] = useState([]);
  const [patients, setPatients] = useState([]);
  const [algorithm, setAlgorithm] = useState("pca");
  const [distanceType, setDistanceType] = useState("euclidean");
  const [geminiApiKey, setGeminiApiKey] = useState(localStorage.GEMINI_API_KEY);
  const [currentGeminiApiKey, setCurrentGeminiApiKey] = useState(localStorage.GEMINI_API_KEY);
  const [neighbors, setNeighbors] = useState(1000);
  const [neighborsChanged, setNeighborsChanged] = useState(false);
  const [clickedIndex, setClickedIndex] = useState(null);
  const [tooltip, setTooltip] = useState(null);
  const [newNode, setNewNode] = useState(null);

  const [metaData, setMetaData] = useState({
    cancer_type: [],
    race: [],
    ethnicity: [],
    gender: [],
    vital_status: [],
    age_at_index: [],
  });

  const [viewState, setViewState] = useState({
    target: [0, -5, 0],
    longitude: 0,
    latitude: 0,
    zoom: 5,
    rotationX: 30, // Tilt the camera
    rotationOrbit: 10,
  });

  const [referenceDocument, setReferenceDocument] = useState("");
  const [comparedDocument, setComparedDocument] = useState("");

  // PCA related data
  const [pcaData, setPcaData] = useState({});
  const [pcaComponents, setPcaComponents] = useState([]);
  const [pcaComponent1, setPcaComponent1] = useState("");
  const [pcaComponent2, setPcaComponent2] = useState("");
  const [pcaComponent3, setPcaComponent3] = useState("");
  const [pcaDimension, setPcaDimension] = useState("3");

  // UMAP related data
  const [umapData, setUmapData] = useState({});
  const [umapDimension, setUmapDimension] = useState("3");
  const [umapNeighbors, setUmapNeighbors] = useState(15);

  // Meta data
  const [colorBy, setColorBy] = useState("");
  const [colors, setColors] = useState([]);
  const [cancerType, setCancerType] = useState("");
  const [race, setRace] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [gender, setGender] = useState("");
  const [vitalStatus, setVitalStatus] = useState("");  
  const [ageAtIndex, setAgeAtIndex] = useState("");

  // Semanthic search related data
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const deckGLParentRef = useRef(null);

  const toggleDrawer = (newOpen) => () => {
    setOpen(newOpen);
  };

  const [dataLoading, setDataLoading] = useState(false);

  const [lineLayerConfig, setLineLayerConfig] = useState({
    id: 'axis-lines',
    data: [
      // X-axis
      { sourcePosition: [0, 0, 0], targetPosition: [10, 0, 0], color: [255, 0, 0] },
      // Y-axis
      { sourcePosition: [0, 0, 0], targetPosition: [0, 10, 0], color: [0, 255, 0] },
      // Z-axis
      { sourcePosition: [0, 0, 0], targetPosition: [0, 0, 10], color: [0, 0, 255] }
    ],
    getSourcePosition: d => d.sourcePosition,
    getTargetPosition: d => d.targetPosition,
    getColor: d => d.color,
    getWidth: 1,
  });

  // Settings
  const handleDistanceTypeChange = (event) => {
    setDistanceType(event.target.value);
  };

  const handleNeighborsChange = (event) => {
    setNeighbors(event.target.value);
  };

  const handleAlgorithmChange = (event, algorithm) => {
    setAlgorithm(algorithm);
  };

  // Meta Data
  const handleColorByChange = (event) => {
    setColorBy(event.target.value);
  };

  const handleCancerTypeChange = (event) => {
    setCancerType(event.target.value);
  };

  const handleRaceChange = (event) => {
    setRace(event.target.value);
  };

  const handleEthnicityChange = (event) => {
    setEthnicity(event.target.value);
  };

  const handleGenderChange = (event) => {
    setGender(event.target.value);
  };

  const handleVitalStatusChange = (event) => {
    setVitalStatus(event.target.value);
  };

  const handleAgeAtIndexChangeChange = (event) => {
    setAgeAtIndex(event.target.value);
  };

  // PCA
  const handleComponent1Change = (event) => {
    setPcaComponent1(event.target.value);
  };

  const handleComponent2Change = (event) => {
    setPcaComponent2(event.target.value);
  };

  const handleComponent3Change = (event) => {
    setPcaComponent3(event.target.value);
  };

  const handlePcaDimensionChange = (event) => {
    if (pcaDimension === "3") {
      setPcaDimension("2");
    } else {
      setPcaDimension("3");
    }
  };

  // Gemini
  const handleSearchQueryChange = (event) => {
    setSearchQuery(event.target.value);
  };

  const handleGeminiApiKeyChange = (event) => {
    setGeminiApiKey(event.target.value);
  };

  // Umap
  const handleUmapNeighborsChange = (event) => {
    setUmapNeighbors(event.target.value);
  };

  const handleUmapDimensionChange = (event) => {
    if (event.target.value === "3") {
      setUmapDimension("2");
    } else {
      setUmapDimension("3");
    }
  };

  const normalizeEmbeddings = (data) => {
    const numFeatures = data[0].length;
    const means = Array(numFeatures).fill(0);
    const stds = Array(numFeatures).fill(0);

    // Compute means and standard deviations for each feature
    data.forEach(row => {
      row.forEach((val, idx) => {
        means[idx] += val;
      });
    });

    means.forEach((mean, idx) => means[idx] /= data.length);

    data.forEach(row => {
      row.forEach((val, idx) => {
        stds[idx] += Math.pow(val - means[idx], 2);
      });
    });

    stds.forEach((std, idx) => stds[idx] = Math.sqrt(std / data.length));

    // Normalize data
    return data.map(row =>
      row.map((val, idx) => (val - means[idx]) / (stds[idx] || 1)) // Avoid division by zero
    );
  };

  const colorizeClosestNodes = (data, distances, color) => {
    const steps = Math.ceil(neighbors / 3);
    const opacities = [192, 128, 64];

    for (let i = 1; i <= neighbors; i++) { // Loop through the given number of neighbors
      const opacityIndex = Math.floor((i - 1) / steps); // Determine the tier based on the step size
      const opacity = opacities[Math.min(opacityIndex, opacities.length - 1)]; // Clamp opacity index

      data[distances[i].index] = {
        ...data[distances[i].index],
        color: [...color, opacity],
        metric: distances[i].metric,
      };
    }

    return data;
  };

  const zoomToNode = (node) => {
    if (node?.position) {
      setViewState((prevState) => ({
        ...prevState,
        target: node.position, // Set target to the node's position
        zoom: 7,
      }));
    }
  };

  const showComparedDocument = (comparedDocument, patient_id) => {
    var win = window.open(
      "",
      "Title",
      "toolbar=no,location=no,directories=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=780,height=576,top="+(screen.height-400)+",left="+(screen.width-840)
    );
    win.document.body.innerHTML = `<h2>Compared Document for ${patient_id}</h2><div>${comparedDocument}</div>`;
  }

  const addEmbedding = () => {
    if (searchQuery) {
      if (!geminiApiKey) {
        alert("A Gemini API key is required to use semantic search.");
        return false;
      }

      requestGemini(searchQuery, geminiApiKey).then((result) => {
        if (result?.error) {
          alert(result?.error?.message);
          return false;
        }

        const color = [
          Math.random() * 255, // Red
          Math.random() * 255, // Green
          Math.random() * 255  // Blue
        ];
        const newNode = {
          id: Math.random().toString(16).slice(2),
          patient_id: "",
          cancer_type: "",
          text: searchQuery,
          embedding: result?.embedding?.values,
          originalColor: color,
          color: color,
        };
        setNewNode(newNode);

        const newPointData = [
          ...pointData.map((row) => {
            return {
              ...row,
              color: [200, 200, 200, 64],
            }
          }),
          newNode
        ];

        setUmapData({});
        setPcaData({});
        setPointData(newPointData);
        setData([
          ...data,
          {
            id: Math.random().toString(16).slice(2),
            text: searchQuery,
            embedding: result?.embedding?.values,
            originalColor: color,
            properties: {
              patient_id: "",
              cancer_type: "",
            }
          }
        ]);
        setSearchQuery("");
        setOpen(false);
      });
    } else {
      alert("Text cannot be empty.");
      return false;
    }
  }

  const saveGeminiApiKey = () => {
    localStorage.setItem("GEMINI_API_KEY", geminiApiKey);
    setCurrentGeminiApiKey(geminiApiKey);
  }

  const resetGeminiApiKey = () => {
    localStorage.removeItem("GEMINI_API_KEY");
    setGeminiApiKey(null);
    setCurrentGeminiApiKey(null);
  }

  const runUmap = (forceUpdate = false) => {
    // Display progress in the UI
    const progressElement = document.createElement('div');
    progressElement.style.color = '#000000';
    progressElement.style.position = 'fixed';
    progressElement.style.top = '50%';
    progressElement.style.left = '50%';
    progressElement.style.transform = 'translate(-50%, -50%)';
    progressElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    progressElement.style.padding = '10px';
    progressElement.style.border = '1px solid #ddd';
    progressElement.innerHTML = 'Initializing...';
    document.body.appendChild(progressElement);

    const transform = async () => {
      let newUmapData = {};
      if (!umapData?.length || forceUpdate) {
        const embeddings = data.map((point) => {
          return point?.embedding;
        });

        const normalizedEmbeddings = normalizeEmbeddings(embeddings);
        newUmapData = await runUmapAsync(
          normalizedEmbeddings,
          3,
          umapNeighbors,
          0.1,
          200,
          (currentStep, totalSteps) => {
            const progressPercentage = ((currentStep / totalSteps) * 100).toFixed(2);
            progressElement.innerHTML = `Progress: ${progressPercentage}% (${currentStep} / ${totalSteps} steps)`;
          }
        );
      } else {
        newUmapData = [ ...umapData ];
      }

      // Remove progress bar after calculation
      progressElement.remove();

      const newChartData = pointData.map((data, index) => {
        return {
          ...data,
          position: [
            newUmapData[index]?.[0], // X coordinate
            newUmapData[index]?.[1], // Y coordinate
            newUmapData[index]?.[2], // Z coordinate
          ],
        };
      });

      if (newNode) {
        const updatedNode = newChartData.find((n) => n.id === newNode.id);
        if (updatedNode) {
          zoomToNode(updatedNode);
          setNewNode(null);
        }
      }

      setPointData(newChartData);
      setUmapData(newUmapData);
    };

    setTimeout(() => {
      transform();
    }, 1000);
  }

  useEffect(() => {
    // Fetch or process data for visualization
    const fetchData = async () => {
      try {
        setDataLoading(true);
        // Load embeddings
        let tcgaData = await (await fetch("/assets/tcga_reports_3000.json.zip")).blob();
        const tcgaZip = new jszip();
        await tcgaZip.loadAsync(tcgaData);
        tcgaData = await (await tcgaZip.file("tcga_reports_3000.json")).async("string");
        tcgaData = JSON.parse(tcgaData);

        // Load meta data
        let patientsData = await (await fetch("/assets/patients_data.json.zip")).blob();
        const patientsZip = new jszip();
        await patientsZip.loadAsync(patientsData);
        patientsData = await (await patientsZip.file("patients_data.json")).async("string");
        patientsData = JSON.parse(patientsData);

        const raceArray = new Set();
        const ethnicityArray = new Set();
        const genderArray = new Set();
        const vitalStatusArray = new Set();
        const ageAtIndexArray = new Set();

        patientsData.forEach((patient) => {
          raceArray.add(patient?.demographic?.race);
          ethnicityArray.add(patient?.demographic?.ethnicity);
          genderArray.add(patient?.demographic?.gender);
          vitalStatusArray.add(patient?.demographic?.vital_status);
          ageAtIndexArray.add(patient?.demographic?.age_at_index);
        });
        const patientsById = Object.fromEntries(patientsData.map(patient => [patient.submitter_id, patient]));

        const data = [];
        const cancerTypeArray = new Set();
        const patients = [];
        tcgaData.forEach((report) => {
          cancerTypeArray.add(report?.properties?.cancer_type);
          patients.push(report?.properties?.patient_id);
          const patient = patientsById[report?.properties?.patient_id];

          data.push({
            id: report?.id,
            patient_id: report?.properties?.patient_id,
            cancer_type: report?.properties?.cancer_type,
            embedding: report?.embedding,
            race: patient?.demographic?.race,
            ethnicity: patient?.demographic?.ethnicity,
            gender: patient?.demographic?.gender,
            vital_status: patient?.demographic?.vital_status,
            age_at_index: patient?.demographic?.age_at_index,
            text: report?.text,
            originalColor: [
              Math.random() * 255, // Red
              Math.random() * 255, // Green
              Math.random() * 255  // Blue
            ],
            color: [200, 200, 200, 64], // Initial light grey color
            distance: 0,
            radius: 1,
          });
        });

        setMetaData({
          cancer_type: [...cancerTypeArray].sort(),
          race: [...raceArray].sort(),
          ethnicity: [...ethnicityArray].sort(),
          gender: [...genderArray].sort(),
          vital_status: [...vitalStatusArray].sort(),
          age_at_index: [...ageAtIndexArray].sort(),
        });
        setPointData(data);
        setData(tcgaData);
        setDataLoading(false);
      } catch (error) {
        setDataLoading(false);
        console.error('Error fetching data:', error);
      }
    };

    fetchData();
  }, []);

  // Handle PCA related logic
  useEffect(() => {
    const newChartData = pointData.map((point, index) => {
      return {
        ...point,
        position: [
          pcaData.data[index][pcaComponent1], // X coordinate
          pcaData.data[index][pcaComponent2], // Y coordinate
          pcaData.data[index][pcaComponent3], // Z coordinate
        ],
      };
    });

    setPointData(newChartData);
  }, [pcaComponent1, pcaComponent2, pcaComponent3]);

  // Handle meta data changes
  useEffect(() => {
    if (colorBy) {
      const colorByData = metaData[colorBy];
      const colors = Object.fromEntries(
        colorByData.map(property => [
          property,
          [
              Math.random() * 255, // Red
              Math.random() * 255, // Green
              Math.random() * 255,  // Blue
              128
          ]
        ])
      );

      // Create a new reference for immutability
      const newData = [...pointData.map((point) => {
        return {
          ...point,
          color: colors[point[colorBy]] ? colors[point[colorBy]] : [200, 200, 200, 64],
        };
      })];

      setPointData(newData);
      setColors(colors);
    } else {
      const coloredData = [...pointData.map((point) => {
        return {
          ...point,
          color: [200, 200, 200, 64],
        };
      })];
      setPointData(coloredData);
      setColors([]);
    }

  }, [colorBy]);

  useEffect(() => {
    // const coloredData = [...pointData.map((point) => {
    //   return {
    //     ...point,
    //     color: [200, 200, 200, 64],
    //   };
    // })];
    // setPointData(coloredData);
  }, [cancerType, gender, race, ethnicity, vitalStatus, ageAtIndex]);

  // Handle neighbors changes
  useEffect(() => {
    if (neighborsChanged && clickedIndex) {
      const clickedNode = pointData[clickedIndex];

      // Create a new reference for immutability
      const newData = [...pointData.map((point) => {
        return {
          ...point,
          color: [200, 200, 200, 64],
        };
      })];
      newData[clickedIndex] = {
        ...newData[clickedIndex],
        color: [255, 0, 0, 256],
      };

      // Find and update the closest nodes
      const distances = newData.map((d, index) => ({
        index,
        metric: distanceType === "euclidean"
          ? euclideanDistance(d.embedding, clickedNode.embedding)
          : cosineDistance(d.embedding, clickedNode.embedding)
      }));

      if (distanceType === "euclidean") {
        distances.sort((a,b) => a.metric - b.metric);
      } else {
        distances.sort((a,b) => b.metric - a.metric);
      }

      const coloredData = colorizeClosestNodes(newData, distances, newData[clickedIndex].originalColor);

      setPointData(coloredData);
      setPatients(distances.slice(0, neighbors).map((distance) => {
        const patient = coloredData[distance.index];
        return {
          patient_id: patient.patient_id,
          cancer_type: patient.cancer_type,
          text: patient.text,
          metric: distance.metric,
        };
      }));

      setNeighborsChanged(false);
    }
  }, [neighborsChanged]);

  // Handle distance type change
  useEffect(() => {
    if (distanceType && clickedIndex) {
      const clickedNode = pointData[clickedIndex];

      // Create a new reference for immutability
      const newData = [...pointData.map((point) => {
        return {
          ...point,
          color: [200, 200, 200, 64],
        };
      })];
      newData[clickedIndex] = {
        ...newData[clickedIndex],
        color: [255, 0, 0, 256],
      };

      // Find and update the closest nodes
      const distances = newData.map((d, index) => ({
        index,
        metric: distanceType === "euclidean"
          ? euclideanDistance(d.embedding, clickedNode.embedding)
          : cosineDistance(d.embedding, clickedNode.embedding)
      }));

      if (distanceType === "euclidean") {
        distances.sort((a,b) => a.metric - b.metric);
      } else {
        distances.sort((a,b) => b.metric - a.metric);
      }

      const coloredData = colorizeClosestNodes(newData, distances, newData[clickedIndex].originalColor);

      setPointData(coloredData);
      setPatients(distances.slice(0, neighbors).map((distance) => {
        const patient = coloredData[distance.index];
        return {
          patient_id: patient.patient_id,
          cancer_type: patient.cancer_type,
          text: patient.text,
          metric: distance.metric,
        };
      }));

      setNeighborsChanged(false);
    }
  }, [distanceType]);

  // Handle algorithm and data changes
  useEffect(() => {
    if (data.length) {
      if (algorithm === 'umap') {
        runUmap();
      } else if (algorithm === 'pca') {
        // Display progress in the UI
        const progressElement = document.createElement('div');
        progressElement.style.color = '#000000';
        progressElement.style.position = 'fixed';
        progressElement.style.top = '50%';
        progressElement.style.left = '50%';
        progressElement.style.transform = 'translate(-50%, -50%)';
        progressElement.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
        progressElement.style.padding = '10px';
        progressElement.style.border = '1px solid #ddd';
        progressElement.innerHTML = 'Computing PCA...';
        document.body.appendChild(progressElement);

        const transform = () => {
          let newPcaData = {};

          if (!pcaData?.data?.length) {
            const embeddings = data.map((row) => row.embedding.slice(0, 200));
            newPcaData = runPca(embeddings);
          } else {
            newPcaData = { ...pcaData };
          }

          // Remove progress bar after calculation
          progressElement.remove();

          const components = newPcaData.components.map((component) => (component * 100).toFixed(2));
          setPcaComponents(components);
          setPcaComponent1(0);
          setPcaComponent2(1);
          setPcaComponent3(2);

          const newChartData = pointData.map((point, index) => {
            return {
              ...point,
              position: [
                newPcaData.data[index][pcaComponent1], // X coordinate
                newPcaData.data[index][pcaComponent2], // Y coordinate
                newPcaData.data[index][pcaComponent3], // Z coordinate
              ],
            };
          });

          if (newNode) {
            const updatedNode = newChartData.find((n) => n.id === newNode.id);
            if (updatedNode) {
              zoomToNode(updatedNode);
              setNewNode(null);
            }
          }

          setPointData(newChartData);
          setPcaData(newPcaData);
        };

        transform();
      }
    }
  }, [algorithm, data]);

  const lineLayer = new LineLayer({
    ...lineLayerConfig,
  })

  const pointLayer = new PointCloudLayer({
    id: 'point-cloud-layer',
    data: pointData,
    getPosition: d => d.position,
    getColor: d => d.color,
    pointSize: 4, // Adjust size for better visibility
    pickable: true, // Enables hover and click interaction
    onClick: info => {
      if (info.object) {
        // Stop rotation on click
        // this.isGraphClicked = true;

        // Change the clicked node's color to its original color
        const index = pointData.indexOf(info.object);
        if (index !== -1) {
          const clickedPosition = info.object.position;
          setClickedIndex(index);

          // Create a new reference for immutability
          const newData = [...pointData.map((point) => {
            return {
              ...point,
              color: [200, 200, 200, 64],
            };
          })];
          newData[index] = {
            ...newData[index],
            color: [255, 0, 0, 256],
          };

          const textDocument = newData[index]?.text;
          setReferenceDocument(textDocument);

          // Find and update the closest nodes
          const distances = newData.map((d, index) => ({
            index,
            metric: distanceType === "euclidean"
              ? euclideanDistance(d.embedding, info.object.embedding)
              : cosineDistance(d.embedding, info.object.embedding)
          }));

          if (distanceType === "euclidean") {
            distances.sort((a,b) => a.metric - b.metric);
          } else {
            distances.sort((a,b) => b.metric - a.metric);
          }

          const coloredData = colorizeClosestNodes(newData, distances, newData[index].originalColor);

          setPointData(coloredData);
          setPatients(distances.slice(0, neighbors).map((distance) => {
            const patient = coloredData[distance.index];
            return {
              patient_id: patient.patient_id,
              cancer_type: patient.cancer_type,
              text: patient.text,
              metric: distance.metric,
            };
          }));

          setViewState((prevState) => ({
            ...prevState,
            target: [0, 0, 0],
            zoom: 5,
          }));
        }
      }
    },
    onHover: (info) => {
      if (info.object) {
        setTooltip({
          x: info.x,
          y: info.y,
          object: info.object,
        });
      } else {
        setTooltip(null);
      }
    },
  });

  return (
    <Grid
      container
      direction="column"
      style={{
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <Grid
        item
        style={{
          height: "fit-content",
          flexGrow: 0,
          width: "100%",
          backgroundColor: lightBlue[900],
        }}
      >
        <Typography
          variant="h6"
          align="left"
          style={{
            borderBottom: "1px solid",
            borderColor: "#000000",
            padding: "8px",
            color: "#ffffff"
          }}
        >
          Embedding Projector
        </Typography>
      </Grid>

      <Grid
        item
        container
        style={{
          flexGrow: 1, // Fills remaining height
        }}
      >
        <Grid
          item
          xs={3}
          style={{
            borderRight: "1px solid black",
            display: "flex", // Make the sidebar a flex container
            flexDirection: "column",
            height: "100%",
          }}
        >
          <Grid
            container
            direction="column"
            style={{
              display: "flex",  // Ensures flex properties take effect
              flexGrow: 1,      // Allows it to fill available space
              minHeight: 0,
            }}
          >

            <Grid item>
              <Typography
                variant="subtitle1"
                color="#000000"
                align="left"
                style={{
                  padding: "8px",
                  fontWeight: "bold"
                }}
              >
                DATA
              </Typography>
              <Divider />
              <Box
                style={{
                  position: "relative",
                  padding: "0 8px 20px 8px",
                }}
              >
                <Grid
                  container
                  style={{
                    position: "relative",
                  }}
                >
                  <Grid item xs={12} sx={{ padding: 1 }}>
                    <FormControl
                      fullWidth
                      variant="standard"
                    >
                      <InputLabel>Color By</InputLabel>
                      <Select
                        name="colorBy"
                        value={colorBy}
                        onChange={handleColorByChange}
                        disabled={dataLoading}
                      >
                        <MenuItem key={""} value={""}></MenuItem>
                        {
                          Object.keys(metaData).map(
                            (colorBy) => 
                              <MenuItem
                                key={colorBy}
                                value={colorBy}
                              >
                                {
                                  colorBy.split('_')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ')
                                }
                              </MenuItem>
                          )
                        }
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sx={{ padding: 1 }}>
                    <FormControl
                      fullWidth
                      variant="standard"
                    >
                      <InputLabel>Cancer Type</InputLabel>
                      <Select
                        name="cancerType"
                        value={cancerType}
                        onChange={handleCancerTypeChange}
                        disabled={dataLoading}
                        MenuProps={{
                          PaperProps: {
                            style: {
                              maxHeight: 400, // Controls dropdown height
                            },
                          },
                        }}
                      >
                        <MenuItem key={""} value={""}></MenuItem>
                        {
                          metaData.cancer_type.map(
                            (cancerType) =>
                              cancerType && <MenuItem key={cancerType} value={cancerType}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  {colors[cancerType] && (
                                    <Box
                                      sx={{
                                        width: 16,
                                        height: 16,
                                        backgroundColor: `rgb(${colors[cancerType].join(", ")})`,
                                        borderRadius: 2,
                                        border: "1px solid #888",
                                      }}
                                    />
                                  )}
                                  {cancerType}
                                </Box>
                              </MenuItem>
                          )
                        }
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sx={{ padding: 1 }}>
                    <FormControl
                      fullWidth
                      variant="standard"
                    >
                      <InputLabel>Gender</InputLabel>
                      <Select
                        name="gender"
                        value={gender}
                        onChange={handleGenderChange}
                        disabled={dataLoading}
                      >
                        <MenuItem key={""} value={""}></MenuItem>
                        {
                          metaData.gender.map(
                            (gender) =>
                              gender && <MenuItem key={gender} value={gender}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  {colors[gender] && (
                                    <Box
                                      sx={{
                                        width: 16,
                                        height: 16,
                                        backgroundColor: `rgb(${colors[gender].join(", ")})`,
                                        borderRadius: 2,
                                        border: "1px solid #888",
                                      }}
                                    />
                                  )}
                                  {gender}
                                </Box>
                              </MenuItem>
                          )
                        }
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sx={{ padding: 1 }}>
                    <FormControl
                      fullWidth
                      variant="standard"
                    >
                      <InputLabel>Race</InputLabel>
                      <Select
                        name="race"
                        value={race}
                        onChange={handleRaceChange}
                        disabled={dataLoading}
                      >
                        <MenuItem key={""} value={""}></MenuItem>
                        {
                          metaData.race.map(
                            (race) =>
                              race && <MenuItem key={race} value={race}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  {colors[race] && (
                                    <Box
                                      sx={{
                                        width: 16,
                                        height: 16,
                                        backgroundColor: `rgb(${colors[race].join(", ")})`,
                                        borderRadius: 2,
                                        border: "1px solid #888",
                                      }}
                                    />
                                  )}
                                  {race}
                                </Box>
                              </MenuItem>
                          )
                        }
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sx={{ padding: 1 }}>
                    <FormControl
                      fullWidth
                      variant="standard"
                    >
                      <InputLabel>Ethnicity</InputLabel>
                      <Select
                        name="ethnicity"
                        value={ethnicity}
                        onChange={handleEthnicityChange}
                        disabled={dataLoading}
                      >
                        <MenuItem key={""} value={""}></MenuItem>
                        {
                          metaData.ethnicity.map(
                            (ethnicity) =>
                              ethnicity && <MenuItem key={ethnicity} value={ethnicity}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  {colors[ethnicity] && (
                                    <Box
                                      sx={{
                                        width: 16,
                                        height: 16,
                                        backgroundColor: `rgb(${colors[ethnicity].join(", ")})`,
                                        borderRadius: 2,
                                        border: "1px solid #888",
                                      }}
                                    />
                                  )}
                                  {ethnicity}
                                </Box>
                              </MenuItem>
                          )
                        }
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sx={{ padding: 1 }}>
                    <FormControl
                      fullWidth
                      variant="standard"
                    >
                      <InputLabel>Vital Status</InputLabel>
                      <Select
                        name="vitalStatus"
                        value={vitalStatus}
                        onChange={handleVitalStatusChange}
                        disabled={dataLoading}
                      >
                        <MenuItem key={""} value={""}></MenuItem>
                        {
                          metaData.vital_status.map(
                            (vitalStatus) =>
                              vitalStatus && <MenuItem key={vitalStatus} value={vitalStatus}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  {colors[vitalStatus] && (
                                    <Box
                                      sx={{
                                        width: 16,
                                        height: 16,
                                        backgroundColor: `rgb(${colors[vitalStatus].join(", ")})`,
                                        borderRadius: 2,
                                        border: "1px solid #888",
                                      }}
                                    />
                                  )}
                                  {vitalStatus}
                                </Box>
                              </MenuItem>
                          )
                        }
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={6} sx={{ padding: 1 }}>
                    <FormControl
                      fullWidth
                      variant="standard"
                    >
                      <InputLabel>Age at Index</InputLabel>
                      <Select
                        name="ageAtIndex"
                        value={ageAtIndex}
                        onChange={handleAgeAtIndexChangeChange}
                        disabled={dataLoading}
                      >
                        <MenuItem key={""} value={""}></MenuItem>
                        {
                          metaData.age_at_index.map(
                            (ageAtIndex) =>
                              ageAtIndex && <MenuItem key={ageAtIndex} value={ageAtIndex}>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                  {colors[ageAtIndex] && (
                                    <Box
                                      sx={{
                                        width: 16,
                                        height: 16,
                                        backgroundColor: `rgb(${colors[ageAtIndex].join(", ")})`,
                                        borderRadius: 2,
                                        border: "1px solid #888",
                                      }}
                                    />
                                  )}
                                  {ageAtIndex}
                                </Box>
                              </MenuItem>
                          )
                        }
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Box>
              <Divider />
            </Grid>

            <Grid
              item
              style={{
                marginTop: 'auto',
                marginBottom: `${drawerBleeding + 10}px`
              }}
            >
              <Divider />
              <TabContext
                value={algorithm}
              >
                <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  <TabList onChange={handleAlgorithmChange} variant="fullWidth">
                    <Tab label="UMAP" value="umap" />
                    <Tab label="T-SNE" value="tsne" />
                    <Tab label="PCA" value="pca" />
                  </TabList>
                </Box>
                <TabPanel
                  value="umap"
                  style={{
                    position: "relative",
                    padding: 0,
                  }}
                >
                  <Box
                    style={{
                      position: "relative",
                      // height: 350,
                      padding: "0 8px",
                    }}
                  >
                    <Grid
                      container
                      style={{
                        position: "relative",
                      }}
                    >
                      <Grid item xs={12} sx={{ padding: 1 }}>
                        <FormControl
                          component="fieldset"
                        >
                          <FormGroup aria-label="position" row>
                            <Stack direction="row" sx={{ alignItems: 'center' }}>
                              <FormLabel
                                sx={{ marginRight: "15px" }}
                              >
                                Dimension</FormLabel>
                              <Typography variant="button">2D</Typography>
                              <Switch
                                checked={umapDimension === "3"}
                                value={umapDimension}
                                onChange={handleUmapDimensionChange}
                              />
                              <Typography variant="button">3D</Typography>
                            </Stack>
                          </FormGroup>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sx={{ padding: 1 }}>
                        <FormControl
                          component="fieldset"
                          fullWidth
                        >
                          <FormLabel>Neighbors</FormLabel>
                          <Slider
                            valueLabelDisplay="on"
                            aria-label="custom thumb label"
                            value={umapNeighbors}
                            onChange={handleUmapNeighborsChange}
                            max={50}
                          />
                        </FormControl>
                      </Grid>
                      <Grid item xs={6} sx={{ padding: 1 }}>
                        <FormControl
                          variant="standard"
                        >
                          <Button
                            variant="contained"
                            onClick={() => runUmap(true)}
                          >Run</Button>
                        </FormControl>
                      </Grid>
                    </Grid>
                  </Box>
                </TabPanel>

                <TabPanel value="tsne">T-SNE</TabPanel>

                <TabPanel
                  value="pca"
                  style={{
                    position: "relative",
                    padding: 0,
                  }}
                >
                  <Box
                    style={{
                      position: "relative",
                      // height: 350,
                      padding: "0 8px",
                    }}
                  >
                    <Grid
                      container
                      style={{
                        position: "relative",
                      }}
                    >
                      <Grid item xs={6} sx={{ padding: 1 }}>
                        <FormControl
                          fullWidth
                          variant="standard"
                        >
                          <InputLabel>X</InputLabel>
                          <Select
                            name="pcaComponent1"
                            value={pcaComponent1}
                            onChange={handleComponent1Change}
                            disabled={dataLoading}
                          >
                            <ListSubheader>Variance (%)</ListSubheader>
                            {
                              pcaComponents.map(
                                (component, index) => <MenuItem key={index} value={index}>{component}</MenuItem>
                              )
                            }
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={6} sx={{ padding: 1 }}>
                        <FormControl
                          fullWidth
                          variant="standard"
                        >
                          <InputLabel>Y</InputLabel>
                          <Select
                            name="pcaComponent2"
                            value={pcaComponent2}
                            onChange={handleComponent2Change}
                            disabled={dataLoading}
                          >
                            {
                              pcaComponents.map(
                                (component, index) => <MenuItem key={index} value={index}>{component}</MenuItem>
                              )
                            }
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={6} sx={{ padding: 1 }}>
                        <FormControl
                          fullWidth
                          variant="standard"
                        >
                          <InputLabel>Z</InputLabel>
                          <Select
                            name="pcaComponent3"
                            value={pcaComponent3}
                            onChange={handleComponent3Change}
                            disabled={pcaDimension === "2" || dataLoading}
                          >
                            {
                              pcaComponents.map(
                                (component, index) => <MenuItem key={index} value={index}>{component}</MenuItem>
                              )
                            }
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={6} sx={{ padding: 1 }}>
                        <FormControl
                          variant="standard"
                        >
                          <Checkbox
                            style={{
                              justifyContent: "flex-start",
                            }}
                            checked={pcaDimension === "3"}
                            onChange={handlePcaDimensionChange}
                          />
                        </FormControl>
                      </Grid>
                    </Grid>
                  </Box>
                </TabPanel>
              </TabContext>
            </Grid>

          </Grid>
        </Grid>
        <Grid
          item
          xs={6}
          style={{
            position: "relative"
          }}
          ref={deckGLParentRef}
        >
          <Backdrop
            sx={(theme) => ({
              color: '#fff',
              zIndex: theme.zIndex.drawer + 1,
              position: "absolute",
            })}
            open={dataLoading}
          >
            <CircularProgress color="inherit" />
          </Backdrop>
          <DeckGL
            style={{
              position: "relative",
              backgroundColor: grey[100],
            }}
            views={
              (algorithm === "umap" && umapDimension === "2")
                ? null
                : (algorithm === "pca" && pcaDimension === "2")
                  ? null
                  : new OrbitView({})}
            initialViewState={viewState}
            controller={{
              dragRotate: true, // Enable rotation controls
              scrollZoom: true, // Enable zooming via scroll
            }}
            layers={[
              lineLayer,
              pointLayer,
            ]}
          >
          </DeckGL>
          {tooltip && (
            <div
              style={{
                position: "absolute",
                left: tooltip.x,
                top: tooltip.y,
                backgroundColor: "white",
                padding: "5px",
                borderRadius: "3px",
                pointerEvents: "none",
                fontSize: "12px",
                boxShadow: "0px 0px 5px rgba(0, 0, 0, 0.3)",
              }}
            >
              <div><b>PATIENT ID:</b> {tooltip?.object?.patient_id}</div>
              <div><b>CANCER TYPE:</b> {tooltip?.object?.cancer_type}</div>
              <div><b>GENDER:</b> {tooltip?.object?.gender}</div>
              <div><b>ETHNICITY:</b> {tooltip?.object?.ethnicity}</div>
              <div><b>RACE:</b> {tooltip?.object?.race}</div>
              <div><b>VITAL STATUS:</b> {tooltip?.object?.vital_status}</div>
              <div><b>AGE AT INDEX:</b> {tooltip?.object?.age_at_index}</div>
            </div>
          )}
          <IconButton
            sx={(theme) => ({
              color: '#fff',
              position: "absolute",
              bottom: 80,
              right: 40,
              width: 80,
              height: 80,
              borderRadius: "50%",
              boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.3)",
              "&:hover": {
                boxShadow: "0px 6px 15px rgba(0, 0, 0, 0.5)",
              },
              "&:focus": {
                outline: "none",
              },
            })}
            onClick={toggleDrawer(true)}
          >
            <Add
              fontSize="large"
              sx={(theme) => ({
                color: theme.palette.primary.main,
              })}
            />
          </IconButton>
          <Global
            styles={{
              '.MuiDrawer-root > .MuiPaper-root': {
                height: `calc(35%)`,
                overflow: 'visible',
                position: "absolute",

              },
            }}
          />
          <SwipeableDrawer
            container={deckGLParentRef.current}
            anchor="bottom"
            open={open}
            onClose={toggleDrawer(false)}
            onOpen={toggleDrawer(true)}
            swipeAreaWidth={drawerBleeding}
            disableSwipeToOpen={false}
            ModalProps={{
              keepMounted: true,
            }}
          >
            <StyledBox
              sx={{
                position: 'absolute',
                top: -drawerBleeding,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                boxShadow: dataLoading || open ? "" : "0px -4px 8px rgba(0, 0, 0, 0.5)",
                visibility: 'visible',
                right: 0,
                left: 0,
              }}
            >
              <Puller />
              <Typography sx={{ p: 2, color: 'text.secondary' }}>Semanthic Search</Typography>
            </StyledBox>
            <StyledBox sx={{
              px: 2,
              pb: 2,
              height: '100%',
              overflow: 'auto'
            }}>
              <TextField
                placeholder="Enter Text"
                variant="outlined"
                fullWidth
                multiline
                rows={5}
                value={searchQuery}
                onChange={handleSearchQueryChange}
              />
              <TextField
                placeholder="A Gemini API key is required to use semantic search. Enter your's here:"
                variant="outlined"
                fullWidth
                value={geminiApiKey || ""}
                onChange={handleGeminiApiKeyChange}
                sx={{
                  marginTop: 1,
                }}
                disabled={currentGeminiApiKey ? true : false}
              />
              <Button
                variant="contained"
                onClick={() => addEmbedding(true)}
                sx={{
                  marginTop: 1,
                }}
              >Add Embedding</Button>
              <Button
                variant="contained"
                onClick={() => currentGeminiApiKey ? resetGeminiApiKey() : saveGeminiApiKey()}
                sx={{
                  marginTop: 1,
                  marginLeft: 1,
                }}
              >{currentGeminiApiKey ? "RESET KEY" : "SAVE KEY"}</Button>
            </StyledBox>
          </SwipeableDrawer>
        </Grid>
        <Grid
          item
          xs={3}
          style={{
            borderLeft: "1px solid black",
            display: "flex", // Make the sidebar a flex container
            flexDirection: "column",
            height: "100%",
          }}
        >
          <Grid
            container
            direction="column"
            style={{
              display: "flex", // Ensures flex properties take effect
              flexGrow: 1, // Allows it to fill available space
              minHeight: 0,
            }}
          >
            <Grid item>
              <Typography
                variant="subtitle1"
                color="#000000"
                align="left"
                style={{
                  padding: "8px",
                  fontWeight: "bold"
                }}
              >
                SETTINGS
              </Typography>
              <Divider />
              <Box
                style={{
                  width: "85%",
                  padding: "4px 8px",
                  margin: "0 auto",
                }}
              >
                <FormLabel>Neighbors</FormLabel>
                <Slider
                  valueLabelDisplay="on"
                  aria-label="custom thumb label"
                  value={neighbors}
                  onChange={handleNeighborsChange}
                  onChangeCommitted={(event, value) => setNeighborsChanged(true)}
                  min={100}
                  max={1000}
                />
              </Box>
              <Divider />
              <Box
                style={{
                  padding: "4px 8px",
                  textAlign: "center",
                }}
              >
                <FormControl>
                  <FormGroup aria-label="position" row>
                    <Stack direction="row" sx={{ alignItems: 'center' }}>
                      <FormLabel
                        sx={{
                          marginRight: "20px",
                          fontSize: 18
                        }}
                      >
                        Distance</FormLabel>
                      <RadioGroup
                        row
                        aria-labelledby="demo-row-radio-buttons-group-label"
                        name="row-radio-buttons-group"
                      >
                        <FormControlLabel
                          value="cosine"
                          checked={distanceType === 'cosine'}
                          onChange={handleDistanceTypeChange}
                          name="radio-buttons"
                          control={<Radio />}
                          label="Cosine"
                          sx={{
                            marginRight: "10px",
                            '.MuiButtonBase-root': {
                            padding: "8px"
                          },
                          }}
                        />
                        <FormControlLabel
                          value="euclidean"
                          checked={distanceType === 'euclidean'}
                          onChange={handleDistanceTypeChange}
                          name="radio-buttons"
                          control={<Radio />}
                          label="Euclidean"
                        />
                      </RadioGroup>
                    </Stack>
                  </FormGroup>
                </FormControl>
              </Box>
            </Grid>
            <Divider />
            
            {
              patients.length > 0 &&
              <Grid item>
                <TableContainer
                  component={Paper}
                    style={{
                    maxHeight: 220,
                    flexShrink: 0,
                  }}
                >
                  <Table
                    sx={{ width: "100%" }}
                    size="small"
                  >
                    <TableBody>
                      {patients.map((patient) => (
                        <TableRow
                          key={patient.patient_id}
                          sx={{ '&:last-child td, &:last-child th': { border: 0 } }}
                          
                        >
                          <TableCell
                            component="th"
                            scope="row"
                            onClick={() => showComparedDocument(patient.text, patient.patient_id)}
                            sx={{ cursor: "pointer" }}
                          >
                            {patient.patient_id}
                          </TableCell>
                          <TableCell align="right">{patient.cancer_type}</TableCell>
                          <TableCell align="right">{patient?.metric ? patient?.metric.toFixed(3) : "0.000"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            }
            
            {
              referenceDocument.length > 0 &&
              <Grid
                container
                direction="column"
                style={{
                  flexGrow: 1,  // Makes this section take remaining height
                  display: "flex",  // Ensures children follow flex behavior
                  minHeight: 0,
                }}
              >
                <Grid item>
                  <Typography
                    variant="subtitle1"
                    color="#000000"
                    align="left"
                    style={{
                      padding: "8px",
                      fontWeight: "bold"
                    }}
                  >
                    REFERENCE DOCUMENT
                  </Typography>
                  <Divider />
                </Grid>
                <Grid
                  item
                  style={{
                    overflowY: "auto",
                    flexGrow: 1,  // Makes this section take remaining height
                    minHeight: 0, // Prevents flex issues
                    maxHeight: 300,
                  }}
                >
                  <Box
                    style={{
                      padding: "8px",
                      whiteSpace: "pre-wrap",  // Ensures text wraps properly
                      wordBreak: "break-word", // Prevents overflow issues
                    }}
                  >
                    {referenceDocument}
                  </Box>
                </Grid>
              </Grid>
            }
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  )
}

export default App
