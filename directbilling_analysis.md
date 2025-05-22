# Direct Billing Application - Complete File & Function Analysis

## 📁 Project Structure
```
DirectBilling/DirectBilling/
├── src/main/java/com/dbs/directBilling/
│   ├── CredentialConfig.java
│   ├── Credentials.java
│   ├── DirectBillingApi.java
│   ├── DirectBillingApiImpl.java
│   ├── DirectBillingApplication.java
│   ├── DirectBillingService.java
│   ├── DirectBillingServiceImpl.java
│   ├── ExcelRow.java
│   ├── RestTemplateConfig.java
│   └── ServletInitializer.java
├── src/main/resources/
│   ├── application.properties
│   └── logback.xml
└── src/main/webapp/WEB-INF/
    ├── web.xml
    ├── jboss-web.xml
    └── jboss-deployment-structure.xml
```

---

## 🔧 **JAVA FILES DETAILED ANALYSIS**

### 1. **DirectBillingApplication.java** - Main Entry Point
```java
@SpringBootApplication(exclude = {SecurityAutoConfiguration.class})
@ServletComponentScan
public class DirectBillingApplication extends SpringBootServletInitializer
```

**Purpose**: Application bootstrap class
**Key Features**:
- **@SpringBootApplication**: Enables auto-configuration, component scanning, configuration
- **exclude = {SecurityAutoConfiguration.class}**: Disables Spring Security (no authentication needed)
- **@ServletComponentScan**: Scans for servlet components (filters, listeners, servlets)
- **extends SpringBootServletInitializer**: Enables WAR deployment to external servers

**Functions**:
- `main(String[] args)`: Entry point that starts Spring Boot application
- **Flow**: JVM → main() → SpringApplication.run() → Spring Context Creation → Bean Initialization

---

### 2. **CredentialConfig.java** - Database Credentials Manager
```java
@Configuration
public class CredentialConfig
```

**Purpose**: Manages database credentials for different modules and countries
**Architecture Pattern**: Configuration Bean with Post-Construction Initialization

#### **Fields (All @Value injected)**:
```java
// CASA Module Credentials
@Value("${casa.sg.user}") private String casaSgUser;
@Value("${casa.sg.pw}") private String casaSgPw;
// ... similar for HK, TW

// CUL Module Credentials  
@Value("${cul.sg.user}") private String culSgUser;
// ... similar for SG, HK, TW, ID

// ML Module Credentials
@Value("${ml.in.user}") private String mlInUser;
// ... similar for IN, SG, HK, TW
```

#### **Functions**:

**`@PostConstruct init()`**:
```java
public void init() {
    credentialsMap = new HashMap<>();
    credentialsMap.put("casa.sg", new Credentials(casaSgUser, casaSgPw));
    credentialsMap.put("casa.hk", new Credentials(casaHkUser, casaHkPw));
    // ... continues for all combinations
}
```
- **When Called**: After Spring creates the bean and injects all @Value properties
- **Purpose**: Creates a lookup map with keys like "casa.sg", "cul.hk", "ml.tw"
- **Key Format**: `{module}.{country}` (lowercase)

**`getCredentialsMap()`**:
- **Returns**: Complete Map<String, Credentials> for other components to use
- **Usage**: Service layer fetches credentials using module+country key

---

### 3. **Credentials.java** - Simple Data Container
```java
public class Credentials {
    private String user;
    private String pw;
}
```

**Purpose**: Plain Old Java Object (POJO) to hold username/password pairs
**Pattern**: Data Transfer Object (DTO)
**Methods**: Standard getters/setters + constructor

---

### 4. **DirectBillingApi.java** - REST Contract Interface
```java
@RestController
public interface DirectBillingApi
```

**Purpose**: Defines REST API contract
**Pattern**: Interface-based API design for better testability

#### **Endpoints**:

**`@GetMapping("/health-check")`**:
```java
public String sayHi();
```
- **URL**: `GET /health-check`
- **Purpose**: Application health monitoring
- **Returns**: Simple success string

**`@GetMapping("uploadFile")`**:
```java
public ResponseEntity<String> executeQueries();
```
- **URL**: `GET /uploadFile` 
- **Purpose**: Triggers the main business process
- **Returns**: ResponseEntity with status and message
- **Note**: Misleading name - doesn't actually upload files, executes queries

---

### 5. **DirectBillingApiImpl.java** - REST Controller Implementation
```java
@Component
public class DirectBillingApiImpl implements DirectBillingApi
```

**Purpose**: Implements the REST API interface
**Pattern**: Implementation of interface-based design

#### **Dependencies**:
```java
@Autowired
DirectBillingService service;
```

#### **Functions**:

**`sayHi()`**:
```java
public String sayHi() {
    logger.info("testing health-check");
    return "SUCCESS";
}
```
- **Flow**: Request → Log message → Return "SUCCESS"
- **Purpose**: Simple health check endpoint

**`executeQueries()`**:
```java
public ResponseEntity<String> executeQueries() {
    try {
        logger.info("starting the exection");
        service.executeQueries();
        return ResponseEntity.ok("File Generated and uploaded");
    } catch (Exception e) {
        return ResponseEntity.ok("Exception in geneating and uploading the file");
    }
}
```
- **Flow**: Request → Log → Call Service → Return Response
- **Issue**: Returns 200 OK even for exceptions (should return 500)
- **Issue**: Typo in "exection" and "geneating"

---

### 6. **DirectBillingService.java** - Service Interface
```java
@Service
public interface DirectBillingService {
    public ResponseEntity<String> executeQueries();
}
```

**Purpose**: Service layer contract
**Pattern**: Interface-based service design

---

### 7. **DirectBillingServiceImpl.java** - Core Business Logic
```java
@Component
public class DirectBillingServiceImpl implements DirectBillingService
```

**Purpose**: Contains all the main business logic
**This is the HEART of the application**

#### **Dependencies & Constants**:
```java
private final CredentialConfig credentialConfig;
@Autowired private ResourceLoader resourceLoader;

// Hard-coded constants (should be externalized)
private static final String API_URL = "https://drivex-services.sgp.dbs.com/filebrowser/cvnt/api/v1/upload";
private static final String BUCKET = "sgprdlob2sts3cvnt217";
private static final String CLIENT_API_KEY = "40U-WZXfkiRzMX1g28kZAQ7_l-vcbop5MdyeXSyW3D0=";
private static final String FOLDER = "external/datasources/fr_iwf";
private static final String ENCRYPTION_PASSWORD = "IBPM";
```

#### **Main Function: `executeQueries()`**

**STEP 1: Read Configuration Data**
```java
List<ExcelRow> rows = readDataRows();
if (rows.isEmpty()) {
    return ResponseEntity.status(HttpStatus.NO_CONTENT)
            .body("No data rows found to process.");
}
```

**STEP 2: Prepare CSV File**
```java
String currentDate = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
String outputFile = "IWF_" + currentDate + ".csv";
```

**STEP 3: Create CSV with Headers**
```java
String[] headers = {"business_date", "BU_SU", "Platform", "App_Code", 
                   "Provider_PC_Code", "Provider_Country_Code", 
                   "Recipient_Country_Code", "Recipient_Legal_Entity_Code",
                   "Driver_Name", "Quantity"};
```

**STEP 4: Process Each Configuration Row**
```java
for (ExcelRow row : rows) {
    int quantity = executeQuery(row);  // Execute database query
    String[] rowData = new String[]{
        currentDate,                    // business_date
        "FR",                          // BU_SU (Fixed value)
        "Digital Process Platform",     // Platform (Fixed)
        row.getAppCode(),              // App_Code (IWF)
        row.getPcCode(),               // Provider_PC_Code
        "SG",                          // Provider_Country_Code (Fixed)
        row.getRc(),                   // Recipient_Country_Code 
        row.getLe(),                   // Recipient_Legal_Entity_Code
        "No. of cases created",        // Driver_Name (Fixed)
        String.valueOf(quantity)       // Quantity (Query result)
    };
    bufferedWriter.write(String.join(",", rowData));
}
```

**STEP 5: Upload to External API**
```java
MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
body.add("bucket", BUCKET);
body.add("client_api_key", CLIENT_API_KEY);
body.add("folder", FOLDER);
body.add("files", new FileSystemResource(outputFile));

RestTemplate restTemplate = new RestTemplate();
ResponseEntity<String> response = restTemplate.exchange(API_URL, HttpMethod.POST, requestEntity, String.class);
```

#### **Helper Function: `readDataRows()`**

**Purpose**: Parses application.properties file to extract database configuration

**Process**:
1. **Load Resource**: `resourceLoader.getResource("classpath:application.properties")`
2. **Find Data Section**: Look for line starting with "AppCode|"
3. **Parse Each Line**: Split by "|" delimiter
4. **Create ExcelRow Objects**: Map each field to appropriate property

**Data Format Expected**:
```
AppCode|Module|Country|Url|Schema|Query|ProviderCountryCode|RecipientCountryCode|RecipientLegalEntityCode|ProviderPCCode
```

**Parsing Logic**:
```java
String[] values = line.split("\\|");
if (values.length >= 10) {
    ExcelRow excelRow = new ExcelRow();
    excelRow.setAppCode(values[0].trim());    // IWF
    excelRow.setModule(values[1].trim());     // CASA/CUL/ML
    excelRow.setCountry(values[2].trim());    // SG/HK/TW/ID/IN
    excelRow.setUrl(values[3].trim());        // JDBC URL
    excelRow.setSchema(values[4].trim());     // Database Schema
    excelRow.setQuery(values[5].trim());      // SQL Query
    excelRow.setPc(values[6].trim());         // Provider Country
    excelRow.setRc(values[7].trim());         // Recipient Country  
    excelRow.setLe(values[8].trim());         // Legal Entity
    excelRow.setPcCode(values[9].trim());     // Provider Code
}
```

#### **Database Function: `executeQuery(ExcelRow row)`**

**Purpose**: Executes SQL query against specific database and returns count

**STEP 1: Get Credentials**
```java
String key = (module.toLowerCase() + "." + country.toLowerCase());
Credentials credential = credentialsMap.get(key);
// Example: "casa.sg" → gets Singapore CASA credentials
```

**STEP 2: Decrypt Password**
```java
StandardPBEStringEncryptor textEncryptor = new StandardPBEStringEncryptor();
textEncryptor.setPassword(ENCRYPTION_PASSWORD);  // "IBPM"
String decryptedPw = textEncryptor.decrypt(encryptedPw);
```

**STEP 3: Database Connection**
```java
DriverManager.setLoginTimeout(60);
Connection connection = DriverManager.getConnection(row.getUrl(), user, decryptedPw);
Statement statement = connection.createStatement();
statement.setQueryTimeout(30);
```

**STEP 4: Schema Selection & Query Execution**
```java
if (row.getSchema() != null && !row.getSchema().isEmpty()) {
    statement.execute("USE " + row.getSchema());
}
ResultSet resultSet = statement.executeQuery(row.getQuery());
if (resultSet.next()) {
    return resultSet.getInt(1);  // Return count from first column
}
```

---

### 8. **ExcelRow.java** - Configuration Data Model
```java
public class ExcelRow {
    private String appCode;      // IWF
    private String module;       // CASA, CUL, ML
    private String country;      // SG, HK, TW, ID, IN
    private String url;          // JDBC connection string
    private String schema;       // Database schema name
    private String query;        // SQL query to execute
    private String pc;           // Provider Country
    private String rc;           // Recipient Country
    private String le;           // Legal Entity
    private String pcCode;       // Provider Code
    // ... unused fields: username, password
}
```

**Purpose**: Data model representing each configuration row from properties file
**Pattern**: POJO with getters/setters

---

### 9. **RestTemplateConfig.java** - HTTP Client Configuration
```java
@Configuration
public class RestTemplateConfig
```

**Purpose**: Configures RestTemplate for HTTP calls
**⚠️ SECURITY ISSUE**: Disables SSL certificate validation

#### **Function: `restTemplate()`**
```java
@Bean
public RestTemplate restTemplate() throws Exception {
    // Creates trust manager that accepts ALL certificates
    TrustManager[] trustAllCerts = new TrustManager[]{
        new X509TrustManager() {
            public void checkServerTrusted(X509Certificate[] certs, String authType) {
                // DOES NOTHING - ACCEPTS ALL CERTIFICATES!
            }
        }
    };
    
    // Disables hostname verification
    HostnameVerifier hostnameVerifier = new HostnameVerifier() {
        public boolean verify(String hostname, SSLSession session) {
            return true;  // ALWAYS RETURNS TRUE!
        }
    };
}
```

**Security Risk**: This configuration makes the application vulnerable to man-in-the-middle attacks

---

### 10. **ServletInitializer.java** - WAR Deployment Support
```java
public class ServletInitializer extends SpringBootServletInitializer {
    @Override
    protected SpringApplicationBuilder configure(SpringApplicationBuilder application) {
        return application.sources(DirectBillingApplication.class);
    }
}
```

**Purpose**: Enables deployment as WAR file to external servlet containers (JBoss/Tomcat)

---

## 📄 **CONFIGURATION FILES ANALYSIS**

### **application.properties**

**Structure**:
```properties
# Database Credentials (Environment Variables)
casa.sg.user = ${CASA_SG_USER}
casa.sg.pw = ${CASA_SG_PW}
# ... similar for all module/country combinations

# Configuration Data (Pipe-delimited)
AppCode|Module|Country|Url|Schema|Query|ProviderCountryCode|RecipientCountryCode|RecipientLegalEntityCode|ProviderPCCode
IWF|CASA|SG|jdbc:mariadb://x01giwfaapp1a.vsi.sgp.dbs.com:4406/casadb_sg|casadb_sg|SELECT COUNT(*) FROM ibpm_case_data WHERE EXTRACT(YEAR_MONTH FROM created_date) = EXTRACT(YEAR_MONTH FROM CURDATE() - INTERVAL 1 MONTH);|SG|SG|71|071_226E
```

**Two Sections**:
1. **Credentials**: Environment variable placeholders for database authentication
2. **Data Configuration**: Pipe-delimited rows with database connection and query information

---

### **logback.xml** - Logging Configuration
```xml
<appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
        <pattern>%d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n</pattern>
    </encoder>
</appender>
```

**Purpose**: Configures console logging with timestamp, thread, log level, and message

---

### **JBoss Deployment Files**

**jboss-web.xml**:
```xml
<context-root>/directBilling</context-root>
```
- Sets application context path to `/directBilling`

**jboss-deployment-structure.xml**:
```xml
<dependencies>
    <module name="org.mariadb.jdbc" export="true"/>
</dependencies>
<exclude-subsystems>
    <subsystem name="jaxrs" />
</exclude-subsystems>
```
- **Dependencies**: Adds MariaDB JDBC driver
- **Exclusions**: Removes conflicting JBoss modules (SLF4J, Jackson, etc.)
- **Exclude JAX-RS**: Uses Spring MVC instead of JAX-RS

---

## 🔄 **COMPLETE APPLICATION FLOW**

### **Startup Flow**:
1. **JBoss Server** loads WAR file
2. **ServletInitializer** configures Spring Boot
3. **DirectBillingApplication** starts with context `/directBilling`
4. **CredentialConfig** loads and maps all database credentials
5. **RestTemplateConfig** creates HTTP client (with disabled SSL validation)
6. **Spring Context** is ready to serve requests

### **Request Flow** (`GET /directBilling/uploadFile`):

```
HTTP Request
    ↓
DirectBillingApiImpl.executeQueries()
    ↓ 
DirectBillingServiceImpl.executeQueries()
    ↓
┌─ readDataRows() ─ Parses application.properties
│  └─ Creates List<ExcelRow> with database configurations
│
├─ Create CSV file: "IWF_YYYYMMDD.csv"
│
├─ For each ExcelRow:
│  ├─ executeQuery(row)
│  │  ├─ Get credentials: credentialsMap.get("module.country")
│  │  ├─ Decrypt password using Jasypt
│  │  ├─ Connect to database using JDBC
│  │  ├─ Execute: SELECT COUNT(*) FROM ibpm_case_data WHERE...
│  │  └─ Return count
│  │
│  └─ Write CSV row with: date, "FR", "Digital Process Platform", 
│     appCode, pcCode, "SG", rc, le, "No. of cases created", count
│
├─ Close CSV file
│
├─ Upload to DBS File Service:
│  ├─ Create multipart request with file
│  ├─ POST to https://drivex-services.sgp.dbs.com/filebrowser/cvnt/api/v1/upload
│  └─ Return upload status
│
└─ Return ResponseEntity with success/failure message
```

### **Database Query Pattern**:
All queries follow the same pattern - counting records from previous month:
```sql
SELECT COUNT(*) FROM ibpm_case_data 
WHERE EXTRACT(YEAR_MONTH FROM created_date) = EXTRACT(YEAR_MONTH FROM CURDATE() - INTERVAL 1 MONTH);
```

### **CSV Output Format**:
```csv
business_date,BU_SU,Platform,App_Code,Provider_PC_Code,Provider_Country_Code,Recipient_Country_Code,Recipient_Legal_Entity_Code,Driver_Name,Quantity
20250522,FR,Digital Process Platform,IWF,071_226E,SG,SG,71,No. of cases created,150
20250522,FR,Digital Process Platform,IWF,071_226E,SG,HK,110,No. of cases created,75
...
#Total_Records_Count,11
```

### **Error Handling Flow**:
- **Database Connection Fails**: Returns 0 count, logs SQL error
- **File Creation Fails**: Returns 500 error with exception message  
- **Upload Fails**: Returns 500 error with HTTP status
- **General Exception**: Returns 200 OK with error message (BUG!)

---

## 🎯 **KEY INSIGHTS**

### **What This Application Does**:
1. **Monthly Reporting**: Generates monthly case count reports from multiple databases
2. **Multi-Region Support**: Handles CASA, CUL, ML modules across SG, HK, TW, ID, IN
3. **Automated Upload**: Pushes reports to DBS file storage service
4. **Standardized Format**: Creates consistent CSV format for downstream systems

### **Business Context**:
- **IWF**: Likely "Internal Workflow" system
- **CASA/CUL/ML**: Different banking modules (Current Account Savings Account, Consumer/Commercial Lending, etc.)
- **Multiple Countries**: DBS operates across Southeast Asia
- **Case Data**: Tracking workflow cases created monthly across regions

### **Technical Architecture**:
- **Spring Boot**: Web framework
- **MariaDB**: Database layer
- **Jasypt**: Password encryption
- **JBoss**: Application server
- **REST API**: HTTP interface
- **File Upload**: Cloud storage integration