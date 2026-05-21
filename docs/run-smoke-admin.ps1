$ErrorActionPreference = 'Stop'

$baseUrl = 'http://localhost:5123'
$results = [System.Collections.Generic.List[object]]::new()

$accessToken = $null
$refreshToken = $null
$authHeaders = @{}

$project = $null
$lot = $null
$client = $null
$beneficiary = $null
$reference = $null
$contract = $null
$schedule = @()
$generatedDocuments = @()
$payment = $null
$secondPayment = $null
$receipt = $null

function Add-Result {
  param(
    [int]$Step,
    [string]$Title,
    [string]$Status,
    [string]$Detail
  )

  $results.Add([pscustomobject]@{
      Step   = $Step
      Title  = $Title
      Status = $Status
      Detail = $Detail
    }) | Out-Null
}

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null,
    [hashtable]$Headers = @{},
    [switch]$Raw
  )

  $uri = "$baseUrl$Path"

  if ($Raw) {
    if ($null -ne $Body) {
      $jsonBody = ($Body | ConvertTo-Json -Depth 10)
      return Invoke-WebRequest -Method $Method -Uri $uri -Headers $Headers -Body $jsonBody -ContentType 'application/json'
    }

    return Invoke-WebRequest -Method $Method -Uri $uri -Headers $Headers
  }

  if ($null -ne $Body) {
    $jsonBody = ($Body | ConvertTo-Json -Depth 10)
    return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers -Body $jsonBody -ContentType 'application/json'
  }

  return Invoke-RestMethod -Method $Method -Uri $uri -Headers $Headers
}

function Run-Step {
  param(
    [int]$Step,
    [string]$Title,
    [scriptblock]$Action
  )

  try {
    $detail = & $Action
    Add-Result -Step $Step -Title $Title -Status 'PASS' -Detail ([string]$detail)
  } catch {
    Add-Result -Step $Step -Title $Title -Status 'FAIL' -Detail $_.Exception.Message
  }
}

$suffix = (Get-Date).ToString('yyyyMMddHHmmss')

Run-Step -Step 1 -Title 'Login admin' -Action {
  $auth = Invoke-Api -Method 'POST' -Path '/api/v1/auth/login' -Body @{
    identifier = 'admin'
    password   = 'ChangeMe123!'
  }

  $script:accessToken = $auth.accessToken
  $script:refreshToken = $auth.refreshToken
  $script:authHeaders = @{ Authorization = "Bearer $($script:accessToken)" }

  "Login correcto. Usuario: $($auth.user.userName)"
}

Run-Step -Step 2 -Title 'Crear proyecto' -Action {
  $script:project = Invoke-Api -Method 'POST' -Path '/api/v1/admin/projects' -Headers $script:authHeaders -Body @{
    code              = "SMK-$suffix"
    name              = "Proyecto Smoke $suffix"
    description       = 'Proyecto de prueba smoke frontend fase 7'
    department        = 'Francisco Morazan'
    municipality      = 'Distrito Central'
    locationReference = 'Zona smoke'
    cadastralKey      = "CAD-$suffix"
    totalAreaM2       = 15000
    status            = 'Activo'
    notes             = 'Creado desde run-smoke-admin.ps1'
  }

  "Proyecto creado: $($script:project.id)"
}

Run-Step -Step 3 -Title 'Crear lote Disponible' -Action {
  $script:lot = Invoke-Api -Method 'POST' -Path '/api/v1/admin/lots' -Headers $script:authHeaders -Body @{
    projectId     = $script:project.id
    blockId       = $null
    code          = "L-$suffix"
    fullCode      = "L-$suffix"
    number        = "$suffix"
    areaM2        = 180
    areaV2        = 258.2
    northMeasure  = 12
    northBoundary = 'Calle Principal'
    southMeasure  = 12
    southBoundary = 'Lote colindante'
    eastMeasure   = 15
    eastBoundary  = 'Avenida Este'
    westMeasure   = 15
    westBoundary  = 'Avenida Oeste'
    listPrice     = 500000
    currency      = 'HNL'
    status        = 'Disponible'
    intendedUse   = 'Vivienda'
    notes         = 'Lote smoke'
  }

  "Lote creado: $($script:lot.id)"
}

Run-Step -Step 4 -Title 'Crear cliente Natural' -Action {
  $script:client = Invoke-Api -Method 'POST' -Path '/api/v1/admin/clients' -Headers $script:authHeaders -Body @{
    personType    = 'Natural'
    firstName     = "Cliente$suffix"
    lastName      = 'Smoke'
    dni           = $null
    rtn           = $null
    nationality   = 'Hondurena'
    maritalStatus = 'Soltero'
    birthDate     = '1990-01-01'
    phone         = '22334455'
    mobile        = '99887766'
    email         = "cliente$suffix@smoke.local"
    address       = 'Barrio smoke'
    department    = 'Francisco Morazan'
    municipality  = 'Distrito Central'
    status        = 'Activo'
    notes         = 'Cliente smoke'
  }

  "Cliente creado: $($script:client.id)"
}

Run-Step -Step 5 -Title 'Crear beneficiario' -Action {
  $script:beneficiary = Invoke-Api -Method 'POST' -Path "/api/v1/admin/clients/$($script:client.id)/beneficiaries" -Headers $script:authHeaders -Body @{
    fullName     = "Beneficiario$suffix"
    dni          = $null
    phone        = '99887766'
    relationship = 'Hermano'
    address      = 'Direccion beneficiario'
    notes        = 'Beneficiario smoke'
  }

  "Beneficiario creado: $($script:beneficiary.id)"
}

Run-Step -Step 6 -Title 'Crear referencia' -Action {
  $script:reference = Invoke-Api -Method 'POST' -Path "/api/v1/admin/clients/$($script:client.id)/references" -Headers $script:authHeaders -Body @{
    fullName            = "Referencia$suffix"
    phone               = '98765432'
    relationshipOrNotes = 'Amigo'
    notes               = 'Referencia smoke'
  }

  "Referencia creada: $($script:reference.id)"
}

Run-Step -Step 7 -Title 'Crear contrato' -Action {
  $script:contract = Invoke-Api -Method 'POST' -Path '/api/v1/admin/contracts' -Headers $script:authHeaders -Body @{
    projectId                = $script:project.id
    lotId                    = $script:lot.id
    clientId                 = $script:client.id
    contractDate             = (Get-Date).ToString('yyyy-MM-dd')
    startDate                = (Get-Date).ToString('yyyy-MM-dd')
    termMonths               = 12
    contractAmount           = 500000
    downPayment              = 50000
    monthlyPayment           = 37500
    interestRate             = 0.12
    lateFeeRate              = 0
    lateFeeRateEnabled       = $false
    annualTotalCost          = 0
    purchaseOptionValue      = 1
    monthlyPaymentDay        = 15
    currency                 = 'HNL'
    specialConditionText     = 'Contrato smoke'
    discountPreparedAmount   = 0
    discountPreparedDeadline = $null
    discountPreparedEnabled  = $false
    notes                    = 'Contrato generado por smoke'
  }

  "Contrato creado: $($script:contract.id) / $($script:contract.contractNumber)"
}

Run-Step -Step 8 -Title 'Validar lote Contratado' -Action {
  $lotDetail = Invoke-Api -Method 'GET' -Path "/api/v1/admin/lots/$($script:lot.id)" -Headers $script:authHeaders
  if ($lotDetail.status -ne 'Contratado') {
    throw "Estado actual del lote: $($lotDetail.status). Esperado: Contratado."
  }

  "Estado de lote correcto: $($lotDetail.status)"
}

Run-Step -Step 9 -Title 'Abrir detalle de contrato' -Action {
  $contractDetail = Invoke-Api -Method 'GET' -Path "/api/v1/admin/contracts/$($script:contract.id)" -Headers $script:authHeaders
  "Detalle cargado. Estado: $($contractDetail.status)"
}

Run-Step -Step 10 -Title 'Validar cronograma' -Action {
  $script:schedule = Invoke-Api -Method 'GET' -Path "/api/v1/admin/contracts/$($script:contract.id)/schedule" -Headers $script:authHeaders
  if (-not $script:schedule -or $script:schedule.Count -eq 0) {
    throw 'Cronograma sin cuotas.'
  }

  "Cronograma OK. Cuotas: $($script:schedule.Count)"
}

Run-Step -Step 11 -Title 'Generar documentos de contrato' -Action {
  $generation = Invoke-Api -Method 'POST' -Path "/api/v1/admin/contracts/$($script:contract.id)/generate-documents" -Headers $script:authHeaders -Body @{}
  "Documentos generados: $($generation.generatedCount)"
}

Run-Step -Step 12 -Title 'Validar lista de documentos' -Action {
  $script:generatedDocuments = Invoke-Api -Method 'GET' -Path "/api/v1/admin/contracts/$($script:contract.id)/documents" -Headers $script:authHeaders
  if (-not $script:generatedDocuments -or $script:generatedDocuments.Count -eq 0) {
    throw 'El contrato no tiene documentos listados.'
  }

  "Documentos listados: $($script:generatedDocuments.Count)"
}

Run-Step -Step 13 -Title 'Registrar pago' -Action {
  $script:payment = Invoke-Api -Method 'POST' -Path '/api/v1/admin/payments' -Headers $script:authHeaders -Body @{
    contractId            = $script:contract.id
    clientId              = $script:client.id
    paymentDate           = (Get-Date).ToString('yyyy-MM-dd')
    amount                = 37500
    currency              = 'HNL'
    paymentMethod         = 'Transferencia'
    bankName              = 'Banco Smoke'
    transactionReference  = "TX-$suffix"
    concept               = 'Pago de prueba'
    notes                 = 'Pago smoke'
  }

  "Pago registrado: $($script:payment.id) / $($script:payment.paymentNumber)"
}

Run-Step -Step 14 -Title 'Aplicar pago a una cuota' -Action {
  $firstInstallment = $script:schedule | Where-Object { $_.remainingAmount -gt 0 } | Select-Object -First 1
  if (-not $firstInstallment) {
    throw 'No hay cuotas con saldo pendiente para aplicar pago.'
  }

  $applyResult = Invoke-Api -Method 'POST' -Path "/api/v1/admin/payments/$($script:payment.id)/apply" -Headers $script:authHeaders -Body @{
    allocations = @(
      @{
        contractInstallmentId = $firstInstallment.id
        amountApplied         = [math]::Min([decimal]$firstInstallment.remainingAmount, 37500)
      }
    )
  }

  "Pago aplicado. Estado pago: $($applyResult.status)"
}

Run-Step -Step 15 -Title 'Consultar balance del contrato' -Action {
  $balance = Invoke-Api -Method 'GET' -Path "/api/v1/admin/contracts/$($script:contract.id)/balance" -Headers $script:authHeaders
  "Balance OK. Total pendiente: $($balance.totalRemaining)"
}

Run-Step -Step 16 -Title 'Crear recibo manual' -Action {
  $script:receipt = Invoke-Api -Method 'POST' -Path '/api/v1/admin/receipts/manual' -Headers $script:authHeaders -Body @{
    paymentId    = $script:payment.id
    contractId   = $script:contract.id
    clientId     = $script:client.id
    receiptDate  = (Get-Date).ToString('yyyy-MM-dd')
    amount       = 37500
    currency     = 'HNL'
    notes        = 'Recibo smoke'
  }

  "Recibo creado: $($script:receipt.id) / $($script:receipt.receiptNumber)"
}

Run-Step -Step 17 -Title 'Descargar PDF de recibo' -Action {
  $pdf = Invoke-Api -Method 'GET' -Path "/api/v1/admin/receipts/$($script:receipt.id)/pdf" -Headers $script:authHeaders -Raw
  if (-not $pdf.Content -or $pdf.RawContentLength -le 0) {
    throw 'PDF vacio o no disponible.'
  }

  "PDF descargado. Bytes: $($pdf.RawContentLength)"
}

Run-Step -Step 18 -Title 'Descargar DOCX de recibo' -Action {
  $docx = Invoke-Api -Method 'GET' -Path "/api/v1/admin/receipts/$($script:receipt.id)/docx" -Headers $script:authHeaders -Raw
  if (-not $docx.Content -or $docx.RawContentLength -le 0) {
    throw 'DOCX vacio o no disponible.'
  }

  "DOCX descargado. Bytes: $($docx.RawContentLength)"
}

Run-Step -Step 19 -Title 'Listar comprobantes' -Action {
  $proofs = Invoke-Api -Method 'GET' -Path '/api/v1/admin/payment-proofs?page=1&pageSize=20' -Headers $script:authHeaders
  "Comprobantes listados: $($proofs.totalCount)"
}

try {
  $proofsForReview = Invoke-Api -Method 'GET' -Path '/api/v1/admin/payment-proofs?page=1&pageSize=100&status=PendienteRevision' -Headers $script:authHeaders
  $pendingProofs = @($proofsForReview.items)

  if ($pendingProofs.Count -gt 0) {
    $approved = Invoke-Api -Method 'POST' -Path "/api/v1/admin/payment-proofs/$($pendingProofs[0].id)/approve" -Headers $script:authHeaders -Body @{
      notes = 'Aprobado desde smoke'
    }
    Add-Result -Step 20 -Title 'Aprobar comprobante' -Status 'PASS' -Detail "Comprobante aprobado: $($approved.id)"
  } else {
    Add-Result -Step 20 -Title 'Aprobar comprobante' -Status 'BLOCKED' -Detail 'No hay comprobantes en PendienteRevision para aprobar.'
  }
} catch {
  Add-Result -Step 20 -Title 'Aprobar comprobante' -Status 'FAIL' -Detail $_.Exception.Message
}

Run-Step -Step 21 -Title 'Crear segundo pago' -Action {
  $script:secondPayment = Invoke-Api -Method 'POST' -Path '/api/v1/admin/payments' -Headers $script:authHeaders -Body @{
    contractId           = $script:contract.id
    clientId             = $script:client.id
    paymentDate          = (Get-Date).ToString('yyyy-MM-dd')
    amount               = 1000
    currency             = 'HNL'
    paymentMethod        = 'Efectivo'
    transactionReference = "TX2-$suffix"
    concept              = 'Pago para anulacion smoke'
    notes                = 'Segundo pago smoke'
  }

  "Segundo pago creado: $($script:secondPayment.id)"
}

try {
  $proofsForReject = Invoke-Api -Method 'GET' -Path '/api/v1/admin/payment-proofs?page=1&pageSize=100&status=PendienteRevision' -Headers $script:authHeaders
  $pendingProofs = @($proofsForReject.items)

  if ($pendingProofs.Count -gt 0) {
    $rejected = Invoke-Api -Method 'POST' -Path "/api/v1/admin/payment-proofs/$($pendingProofs[0].id)/reject" -Headers $script:authHeaders -Body @{
      reason = 'Rechazo smoke por validacion'
      notes  = 'Rechazado desde smoke'
    }
    Add-Result -Step 22 -Title 'Rechazar comprobante' -Status 'PASS' -Detail "Comprobante rechazado: $($rejected.id)"
  } else {
    Add-Result -Step 22 -Title 'Rechazar comprobante' -Status 'BLOCKED' -Detail 'No hay comprobantes en PendienteRevision para rechazar.'
  }
} catch {
  Add-Result -Step 22 -Title 'Rechazar comprobante' -Status 'FAIL' -Detail $_.Exception.Message
}

Run-Step -Step 23 -Title 'Anular pago de prueba' -Action {
  $voided = Invoke-Api -Method 'POST' -Path "/api/v1/admin/payments/$($script:secondPayment.id)/void" -Headers $script:authHeaders -Body @{
    reason = 'Anulacion smoke'
  }

  "Pago anulado: $($voided.id) / Estado: $($voided.status)"
}

Run-Step -Step 24 -Title 'Anular recibo de prueba' -Action {
  $voidedReceipt = Invoke-Api -Method 'POST' -Path "/api/v1/admin/receipts/$($script:receipt.id)/void" -Headers $script:authHeaders -Body @{
    reason = 'Anulacion recibo smoke'
  }

  "Recibo anulado: $($voidedReceipt.id) / Estado: $($voidedReceipt.status)"
}

Run-Step -Step 25 -Title 'Validar filtros basicos de listados' -Action {
  $null = Invoke-Api -Method 'GET' -Path "/api/v1/admin/projects?page=1&pageSize=10&search=SMK-$suffix" -Headers $script:authHeaders
  $null = Invoke-Api -Method 'GET' -Path '/api/v1/admin/lots?page=1&pageSize=10&status=Contratado' -Headers $script:authHeaders
  $null = Invoke-Api -Method 'GET' -Path '/api/v1/admin/clients?page=1&pageSize=10&search=Cliente' -Headers $script:authHeaders
  $null = Invoke-Api -Method 'GET' -Path '/api/v1/admin/contracts?page=1&pageSize=10&status=Borrador' -Headers $script:authHeaders
  $null = Invoke-Api -Method 'GET' -Path '/api/v1/admin/payments?page=1&pageSize=10&status=Registrado' -Headers $script:authHeaders
  $null = Invoke-Api -Method 'GET' -Path '/api/v1/admin/receipts?page=1&pageSize=10&status=Emitido' -Headers $script:authHeaders
  $null = Invoke-Api -Method 'GET' -Path '/api/v1/admin/payment-proofs?page=1&pageSize=10&status=PendienteRevision' -Headers $script:authHeaders

  'Filtros de endpoints listados respondieron correctamente.'
}

Run-Step -Step 26 -Title 'Logout' -Action {
  $null = Invoke-Api -Method 'POST' -Path '/api/v1/auth/logout' -Headers $script:authHeaders -Body @{
    refreshToken = $script:refreshToken
  }
  'Logout correcto.'
}

Run-Step -Step 27 -Title 'Validar 401 con sesion invalida' -Action {
  try {
    Invoke-Api -Method 'GET' -Path '/api/v1/auth/me' -Headers @{ Authorization = 'Bearer invalid-token' } | Out-Null
    throw 'Se esperaba 401 y la llamada fue aceptada.'
  } catch {
    if ($_.Exception.Message -match '401') {
      return 'Respuesta 401 detectada correctamente.'
    }

    throw
  }
}

Add-Result -Step 28 -Title 'Validar permisos visuales minimos' -Status 'BLOCKED' -Detail 'Requiere ejecucion manual en navegador con usuarios de permisos recortados.'

$outputPath = Join-Path $PSScriptRoot 'FRONTEND_SMOKE_ADMIN_RESULTS.json'
$results | ConvertTo-Json -Depth 8 | Set-Content -Path $outputPath -Encoding utf8

$results | Format-Table -AutoSize
Write-Host ""
Write-Host "Resultados guardados en: $outputPath"
