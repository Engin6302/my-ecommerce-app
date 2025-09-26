# 🔑 AWS Console'dan ECR Repository Oluşturma ve Login Token Alma

## Adım 1: AWS Console'a Giriş ve ECR Repository Oluşturma

### 1.1 AWS Console'a Gidin
1. https://console.aws.amazon.com/ adresine gidin
2. AWS hesabınızla giriş yapın
3. **Services** menüsünden **ECR** (Elastic Container Registry) seçin
4. **Region**: `EU (Stockholm) eu-north-1` seçili olduğundan emin olun

### 1.2 İlk Repository Oluşturun (Frontend)
1. **"Create repository"** butonuna tıklayın
2. **Repository name**: `my-app-frontend` yazın
3. **Visibility settings**: Private (varsayılan)
4. **"Create repository"** butonuna tıklayın

### 1.3 İkinci Repository Oluşturun (Backend)  
1. Tekrar **"Create repository"** butonuna tıklayın
2. **Repository name**: `my-app-backend` yazın
3. **Visibility settings**: Private (varsayılan)
4. **"Create repository"** butonuna tıklayın

## Adım 2: Login Token Alma

### 2.1 View Push Commands
1. **ECR Dashboard**'da `my-app-frontend` repository'sine tıklayın
2. **"View push commands"** butonuna tıklayın
3. Açılan popup'ta **1. numaralı komut**u kopyalayın

### 2.2 Login Komutu Formatı
Kopyaladığınız komut şuna benzer olacak:
```
aws ecr get-login-password --region eu-north-1 | docker login --username AWS --password-stdin 986619734913.dkr.ecr.eu-north-1.amazonaws.com
```

## Adım 3: PowerShell'de Login (AWS CLI Olmadan)

### Alternatif 1: AWS CloudShell Kullanın
1. AWS Console'da sağ üstten **CloudShell** ikonuna tıklayın
2. Şu komutu çalıştırın:
```bash
aws ecr get-login-password --region eu-north-1
```
3. Çıkan uzun string'i kopyalayın (bu sizin login token'ınız)

### Alternatif 2: IAM User Access Key ile
1. **IAM Console > Users > Your User > Security credentials**
2. **Create access key** ile yeni key oluşturun
3. Access Key ID ve Secret Access Key'i not alın

## Adım 4: Manuel Docker Login

Token'ı aldıktan sonra:

```powershell
# Token'ı değişken olarak kaydet (GÜVENLİK: Terminal'de görünmez)
$token = Read-Host -AsSecureString "ECR Login Token'ını girin"
$plainToken = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($token))

# Docker login
echo $plainToken | docker login --username AWS --password-stdin 986619734913.dkr.ecr.eu-north-1.amazonaws.com
```

VEYA direk token ile:
```powershell
docker login --username AWS --password [BURAYA_TOKEN_YAPIŞTIR] 986619734913.dkr.ecr.eu-north-1.amazonaws.com
```

## 🚨 Güvenlik Notu
- Login token'ı 12 saat geçerlidir
- Terminal geçmişinde token görünebilir, dikkatli olun
- Token'ı text dosyasına kaydetmeyin

## Sonraki Adım
Login başarılı olduktan sonra:
```powershell
docker push 986619734913.dkr.ecr.eu-north-1.amazonaws.com/my-app-frontend:latest
docker push 986619734913.dkr.ecr.eu-north-1.amazonaws.com/my-app-backend:latest
```