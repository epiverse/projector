<?php
function fetchAllData($url) {
    $allData = [];
    $from = 1;
    $currentUrl = $url;

    while ($currentUrl) {
        $response = @file_get_contents($currentUrl . "&from=".$from);
        if ($response === FALSE) {
            die("Error fetching data from API.");
        }

        $data = json_decode($response, true);
        if (isset($data['data']['hits'])) {
            $allData = array_merge($allData, $data['data']['hits']);
        }

        // Check for next page link
        $currentPage = $data['data']['pagination']['page'];
        $pages = $data['data']['pagination']['pages'];

        if ($currentPage !== $pages) {
            $from = $currentPage * 1000 + 1;
        } else {
            $currentUrl = null;
        }
    }

    return $allData;
}

// API URL
$apiUrl = "https://api.gdc.cancer.gov/cases?filters=" . urlencode(json_encode([
    "op" => "in",
    "content" => [
        "field" => "project.program.name",
        "value" => ["TCGA"]
    ]
])) . "&fields=submitter_id,case_id,primary_site,disease_type,demographic.race,demographic.ethnicity,demographic.gender,demographic.vital_status,demographic.year_of_birth,demographic.age_at_index,project.project_id&format=json&size=1000";

// Fetch data
$data = fetchAllData($apiUrl);

// Save data to a JSON file
$jsonFile = 'patients_data.json';
file_put_contents($jsonFile, json_encode($data, JSON_PRETTY_PRINT));

// Create a ZIP archive
$zipFile = 'patients_data.json.zip';
$zip = new ZipArchive();

if ($zip->open("public/assets/" . $zipFile, ZipArchive::CREATE) === TRUE) {
    $zip->addFile($jsonFile); // Add JSON file to ZIP
    $zip->close();
    
    // Delete the JSON file after zipping (optional)
    unlink($jsonFile);
    
    echo "Data saved successfully to $zipFile";
} else {
    echo "Failed to create ZIP file.";
}

?>
